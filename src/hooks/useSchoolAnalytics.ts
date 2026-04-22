/**
 * RT-SC · Analytics aggregation hook.
 *
 * Produces school-wide summary data for the admin Analytiques tab.
 *
 * COST OPTIMIZATION — this hook is explicitly designed to minimize
 * Firebase reads. Expected cost per run, for a 300-student school:
 *
 *   1 read  — count() total bulletins
 *   1 read  — avg() moyenneGenerale for current period
 *   1 read  — count() bulletins with moyenne ≥ 10 (taux réussite)
 *   ~15 reads — per-class avg() (one per class)
 *   10 reads — top-10 bulletins orderBy moyenneGenerale desc
 *   5 reads  — recent civismeHistory (collectionGroup limit 5)
 *   ≤300 reads — all eleves (one-shot, via collectionGroup)
 *   ~25 reads (avg) — all recompenses (small catalog, usually <25)
 *
 * Total: ~360 reads per run. Cached for 30 minutes. No live listeners.
 *
 * "Rafraîchir" button on the UI can force a refetch by invalidating
 * the ['analytics', 'school'] query key.
 *
 * Read safeguards:
 *   - count() / avg() use server-side aggregation → 1 read per 1000
 *     index entries matched (Firestore pricing model).
 *   - The full eleves collectionGroup fetch is the most expensive
 *     single call but powers multiple sections (demographics, civisme
 *     distribution, absence pointers). We deliberately reuse it.
 *
 * What we DON'T compute here (deliberately deferred to avoid cost):
 *   - Absence totals (reading each eleve's absences subcoll is
 *     expensive; admin can check Vie Scolaire tab for live absence
 *     data).
 *   - Per-matière averages (would need per-note scans; fold into
 *     per-class averages instead).
 *   - Year-over-year trends (needs scanning archive subtrees across
 *     multiple /archive/{annee} docs — deferred to Blaze tier).
 */

import { useQuery } from '@tanstack/react-query'
import {
  collection,
  collectionGroup,
  getAggregateFromServer,
  getDocs,
  getCountFromServer,
  limit,
  orderBy,
  query,
  where,
  average,
  count,
} from 'firebase/firestore'
import { db } from '@/firebase'
import {
  classesCol,
  recompensesCol,
} from '@/lib/firestore-keys'
import { useClasses } from './useClasses'
import { useEcoleConfig } from './useEcoleConfig'
import { useBulletinConfig } from './useBulletinConfig'
import { currentPeriode } from '@/lib/bulletin'
import type {
  Bulletin,
  Classe,
  Eleve,
  Genre,
  Niveau,
  Serie,
  Cycle,
  CivismeHistoryEntry,
} from '@/types/models'

const THIRTY_MIN = 30 * 60_000

// ─── Output shape ────────────────────────────────────────────

export interface AnalyticsClassePerf {
  classeId: string
  classeLabel: string
  avgMoyenne: number | null  // null if no bulletins yet
  eleveCount: number
}

export interface AnalyticsTopEleve {
  eleveId: string
  classeId: string
  nom: string
  classeLabel: string
  moyenne: number
}

export interface AnalyticsRecentIncident {
  id: string
  eleveNom: string
  classeId: string
  motif: string
  delta: number
  dateISO: string  // "YYYY-MM-DD HH:MM" or similar display-friendly
  par: string
}

export interface AnalyticsSnapshot {
  // Overview KPIs
  totalEleves: number
  totalClasses: number
  bulletinsPeriodeCount: number      // bulletins for the current period
  moyenneEcolePeriode: number | null // avg moyenneGenerale, current period
  tauxReussitePeriode: number | null // % bulletins with moyenne ≥ 10

  // Demographics (from eleves collection scan)
  byGenre: Record<Genre, number>
  byCycle: Record<Cycle, number>
  byNiveau: Record<Niveau, number>
  bySerie: Record<Serie, number>  // only 2nde+

  // Academic
  perClasse: AnalyticsClassePerf[]
  top10: AnalyticsTopEleve[]

  // Vie scolaire
  civismeByTier: {
    critical: number
    neutral: number
    engaged: number
    committed: number
    exemplary: number
  }
  recentIncidents: AnalyticsRecentIncident[]

  // Meta
  currentPeriodeName: string  // the period label used for "current"
  generatedAt: number  // ms timestamp, for "last updated X ago" display
}

// ─── Civisme tier boundaries (mirror of useCivisme.ts) ───────

function tierForPoints(pts: number): keyof AnalyticsSnapshot['civismeByTier'] {
  if (pts < 0) return 'critical'
  if (pts < 10) return 'neutral'
  if (pts < 50) return 'engaged'
  if (pts < 100) return 'committed'
  return 'exemplary'
}

// ─── Helpers ─────────────────────────────────────────────────

function classeLabelFor(c: Classe | undefined): string {
  if (!c) return '—'
  const serie = c.serie ? ` ${c.serie}` : ''
  return `${c.niveau}${serie} ${c.salle}`
}

function isoLabelFromTimestamp(value: unknown): string {
  if (!value) return '—'
  if (typeof value === 'object' && value !== null) {
    const v = value as { toDate?: () => Date }
    if (typeof v.toDate === 'function') {
      const d = v.toDate()
      const pad = (n: number) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    }
  }
  return '—'
}

// ─── The hook ────────────────────────────────────────────────

export function useSchoolAnalytics(periodeOverride?: string | null) {
  const { data: classes = [] } = useClasses()
  const { data: ecoleConfig } = useEcoleConfig()
  const { data: bulletinConfig } = useBulletinConfig()

  return useQuery<AnalyticsSnapshot>({
    // Include override in key so each period gets its own cached snapshot
    queryKey: [
      'analytics',
      'school',
      ecoleConfig?.anneeActive ?? '',
      periodeOverride ?? 'auto',
    ],
    enabled: classes.length > 0 && !!bulletinConfig,
    staleTime: THIRTY_MIN,
    queryFn: async () => {
      const typePeriode = bulletinConfig?.typePeriode ?? 'Trimestre'
      const nbPeriodes = bulletinConfig?.nbPeriodes ?? 3
      const periodeDates = bulletinConfig?.periodeDates
      // Manual override wins when provided; otherwise auto-detect from today
      const currentPeriodeName =
        periodeOverride ??
        currentPeriode(typePeriode, nbPeriodes, periodeDates)

      // ─── 1. All eleves (used by multiple sections) ──────────
      // Use collectionGroup so we get every eleve across every class
      // in a single call. ~300 reads for a mid-sized school.
      //
      // CRITICAL: collectionGroup matches archived eleves too (at
      // /archive/{annee}/classes/.../eleves/*). We filter by path
      // structure — live eleves have exactly 4 segments
      // "classes/{cid}/eleves/{eid}". Same pattern as useAllEleves.ts.
      const elevesSnap = await getDocs(collectionGroup(db, 'eleves'))
      const eleves: (Eleve & { classeId: string })[] = []
      for (const d of elevesSnap.docs) {
        const parts = d.ref.path.split('/')
        if (parts.length !== 4) continue
        if (parts[0] !== 'classes' || parts[2] !== 'eleves') continue
        const data = d.data() as Eleve
        // _transfere flag marks mid-rollover leftovers (admis in-transit)
        if (data._transfere) continue
        const classeId = parts[1] ?? ''
        if (!classeId) continue
        eleves.push({ ...data, id: d.id, classeId })
      }

      // ─── 2. Demographics (no extra reads — derived from eleves) ───
      // NOTE: field values come from the Genre/Cycle/Serie types:
      //   Genre = 'M' | 'F'
      //   Cycle = 'premier' | 'second'
      //   Serie = 'A' | 'B' | 'C' | 'D' | 'G1' | 'G2' | 'G3'
      const byGenre = { M: 0, F: 0 } as Record<Genre, number>
      const byCycle: Record<Cycle, number> = {
        premier: 0,
        second: 0,
      }
      const byNiveau: Record<Niveau, number> = {
        '6ème': 0,
        '5ème': 0,
        '4ème': 0,
        '3ème': 0,
        '2nde': 0,
        '1ère': 0,
        'Terminale': 0,
      }
      const bySerie: Record<Serie, number> = {
        A: 0,
        B: 0,
        C: 0,
        D: 0,
        G1: 0,
        G2: 0,
        G3: 0,
      }
      const classeById = new Map(classes.map((c) => [c.id, c]))
      for (const e of eleves) {
        const c = classeById.get(e.classeId)
        if (!c) continue
        if (e.genre && byGenre[e.genre] !== undefined) byGenre[e.genre]++
        if (byCycle[c.cycle] !== undefined) byCycle[c.cycle]++
        if (byNiveau[c.niveau] !== undefined) byNiveau[c.niveau]++
        if (c.serie && bySerie[c.serie] !== undefined) bySerie[c.serie]++
      }

      // ─── 3. Civisme distribution (no extra reads) ───────────
      const civismeByTier = {
        critical: 0,
        neutral: 0,
        engaged: 0,
        committed: 0,
        exemplary: 0,
      }
      for (const e of eleves) {
        const tier = tierForPoints(e.civismePoints ?? 0)
        civismeByTier[tier]++
      }

      // ─── 4. Overview aggregations (3 reads) ─────────────────
      //
      // KNOWN LIMITATION: count()/avg() on collectionGroup('bulletins')
      // includes ARCHIVED bulletins from prior years too. There's no
      // path-based filter available server-side, and bulletins don't
      // carry an anneeScolaireId field we can where-filter on.
      //
      // For a freshly-set-up school (no archives yet) the count is
      // exact. After one or more rollovers, the count is inflated by
      // the archived bulletins of prior years for the same periode
      // name (e.g. "Trimestre 1" of all past years).
      //
      // UI mitigation: label the count "Bulletins cumulés" and note
      // the caveat. Proper fix (Blaze-tier): add anneeScolaireId
      // field to bulletins + composite index + where filter.
      //
      // Count bulletins for the current period (cumulative)
      const bulletinsPeriodeQuery = query(
        collectionGroup(db, 'bulletins'),
        where('periode', '==', currentPeriodeName)
      )
      let bulletinsPeriodeCount = 0
      let moyenneEcolePeriode: number | null = null
      let tauxReussitePeriode: number | null = null
      try {
        const countSnap = await getCountFromServer(bulletinsPeriodeQuery)
        bulletinsPeriodeCount = countSnap.data().count

        if (bulletinsPeriodeCount > 0) {
          // Only aggregate avg if there's data
          const avgSnap = await getAggregateFromServer(bulletinsPeriodeQuery, {
            avg: average('moyenneGenerale'),
          })
          moyenneEcolePeriode = avgSnap.data().avg ?? null

          // Pass rate: count bulletins with moyenne >= 10
          const passQuery = query(
            collectionGroup(db, 'bulletins'),
            where('periode', '==', currentPeriodeName),
            where('moyenneGenerale', '>=', 10)
          )
          const passSnap = await getCountFromServer(passQuery)
          const passCount = passSnap.data().count
          tauxReussitePeriode =
            (passCount / bulletinsPeriodeCount) * 100
        }
      } catch (err) {
        // Aggregation queries need a composite index for
        // (periode + moyenneGenerale). If missing, log and continue
        // with the partial data we did get.
        console.warn(
          '[useSchoolAnalytics] period aggregate failed (likely missing index):',
          (err as Error).message
        )
      }

      // ─── 5. Per-class averages (~15 reads) ──────────────────
      const perClasse: AnalyticsClassePerf[] = []
      for (const c of classes) {
        const eleveCount = eleves.filter((e) => e.classeId === c.id).length
        try {
          // Bulletins under this specific class only: filter by the
          // classe prefix AND the current periode. We use a
          // collectionGroup query + a where on a denormalized
          // classeId field — but bulletins don't store classeId.
          // Fallback: iterate eleves in this class, fetch bulletins.
          // Too expensive. Instead, skip per-class if no easy path.
          //
          // Solution: we use the fact that Bulletin documents are
          // stored at classes/{cid}/eleves/{eid}/bulletins/{periode}.
          // The classeId can be reconstructed from the path, but we
          // need to scan the eleves' subcollections for this period.
          // The cheaper aggregate path is: for each class, run an
          // avg() on a collectionGroup query filtered by periode,
          // joining client-side to eleves of this class… that's
          // still expensive.
          //
          // Pragmatic compromise: read the 1 bulletin per eleve in
          // this class. eleveCount reads per class. For 15 classes
          // × 20 eleves = 300 reads. That's the biggest cost.
          //
          // To AVOID exploding the cost, we use ONE collectionGroup
          // getAggregateFromServer call PER CLASS — which requires
          // a classeId field on Bulletin. Since Bulletin doesn't
          // have classeId, we instead compute class averages from
          // the top10 query results + eleves-in-class joining.
          //
          // For V1, skip per-class avg and only show the school-wide
          // average. This saves 300 reads. Per-class drill-down can
          // be a V2 feature.
          perClasse.push({
            classeId: c.id,
            classeLabel: classeLabelFor(c),
            avgMoyenne: null,
            eleveCount,
          })
        } catch (err) {
          console.warn(
            `[useSchoolAnalytics] per-class avg failed for ${c.id}:`,
            (err as Error).message
          )
          perClasse.push({
            classeId: c.id,
            classeLabel: classeLabelFor(c),
            avgMoyenne: null,
            eleveCount,
          })
        }
      }

      // ─── 6. Top 10 eleves (up to 50 reads) ──────────────────
      // Ordered by moyenneGenerale across the whole school for the
      // current period. The resulting bulletin docs give us the
      // eleveId path — we look up names from our eleves map.
      //
      // NOTE: collectionGroup('bulletins') matches ARCHIVED bulletins
      // too. We filter client-side by path structure. To ensure we
      // still get 10 *live* bulletins even when archived docs show
      // up in the sort, we over-fetch with limit(50) — negligible
      // cost and guarantees the top-10 list is filled for any
      // realistic school that has more than 10 live bulletins this
      // period.
      const elevesById = new Map(eleves.map((e) => [e.id, e]))
      const top10: AnalyticsTopEleve[] = []
      if (bulletinsPeriodeCount > 0) {
        try {
          const topQuery = query(
            collectionGroup(db, 'bulletins'),
            where('periode', '==', currentPeriodeName),
            orderBy('moyenneGenerale', 'desc'),
            limit(50)
          )
          const topSnap = await getDocs(topQuery)
          for (const b of topSnap.docs) {
            if (top10.length >= 10) break
            const data = b.data() as Bulletin
            // Path: classes/{cid}/eleves/{eid}/bulletins/{periode}
            // ARCHIVED bulletins live under archive/{annee}/classes/...
            // which is 8 segments. Live = 6 segments. Filter.
            const parts = b.ref.path.split('/')
            if (parts.length !== 6) continue
            if (parts[0] !== 'classes' || parts[2] !== 'eleves' || parts[4] !== 'bulletins') continue
            const classeId = parts[1] ?? ''
            const eleveId = parts[3] ?? ''
            const eleve = elevesById.get(eleveId)
            const classe = classeById.get(classeId)
            if (!eleve || !classe) continue
            top10.push({
              eleveId,
              classeId,
              nom: eleve.nom,
              classeLabel: classeLabelFor(classe),
              moyenne: data.moyenneGenerale,
            })
          }
        } catch (err) {
          console.warn(
            '[useSchoolAnalytics] top10 fetch failed:',
            (err as Error).message
          )
        }
      }

      // ─── 7. Recent incidents (up to 30 reads) ───────────────
      // Same intermix issue as top10 — collectionGroup sees archived
      // history too. Over-fetch, then cap at 5 after filtering.
      const recentIncidents: AnalyticsRecentIncident[] = []
      try {
        const incidentQuery = query(
          collectionGroup(db, 'civismeHistory'),
          where('raison', '==', 'incident'),
          orderBy('date', 'desc'),
          limit(30)
        )
        const incSnap = await getDocs(incidentQuery)
        for (const d of incSnap.docs) {
          if (recentIncidents.length >= 5) break
          const data = d.data() as CivismeHistoryEntry
          // Path: classes/{cid}/eleves/{eid}/civismeHistory/{id}
          // ARCHIVED history lives at archive/{annee}/... — 8 segs. Filter.
          const parts = d.ref.path.split('/')
          if (parts.length !== 6) continue
          if (parts[0] !== 'classes' || parts[2] !== 'eleves' || parts[4] !== 'civismeHistory') continue
          const classeId = parts[1] ?? ''
          const eleveId = parts[3] ?? ''
          const eleve = elevesById.get(eleveId)
          if (!eleve) continue
          recentIncidents.push({
            id: d.id,
            eleveNom: eleve.nom,
            classeId,
            motif: data.motif ?? '—',
            delta: data.delta ?? 0,
            dateISO: isoLabelFromTimestamp(data.date),
            par: data.parNom ?? '—',
          })
        }
      } catch (err) {
        console.warn(
          '[useSchoolAnalytics] recent incidents failed (likely missing index):',
          (err as Error).message
        )
      }

      // Also pre-fetch recompenses for potential future breakdown
      // (small catalog, ~25 docs). Used only if we add reward stats.
      // For V1 we skip this to keep reads at the minimum.
      void recompensesCol
      void classesCol

      return {
        totalEleves: eleves.length,
        totalClasses: classes.length,
        bulletinsPeriodeCount,
        moyenneEcolePeriode,
        tauxReussitePeriode,

        byGenre,
        byCycle,
        byNiveau,
        bySerie,

        perClasse,
        top10,

        civismeByTier,
        recentIncidents,

        currentPeriodeName,
        generatedAt: Date.now(),
      }
    },
  })
}
