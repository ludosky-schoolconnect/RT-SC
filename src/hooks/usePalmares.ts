/**
 * RT-SC · Palmarès data engine.
 *
 * Given a periode name ("Trimestre 1", "Semestre 2", "Année"), this
 * hook walks every class, reads each élève's bulletin for that
 * period, collects only LOCKED bulletins (estVerrouille=true), and
 * returns them sorted by moyenneGenerale desc along with some
 * grouping metadata.
 *
 * Why a custom hook instead of individual useEleves + useBulletins?
 * Palmarès is a rare, heavy-weight admin operation: we need every
 * eleve's bulletin across the entire school. We intentionally avoid
 * putting this on each class's useEleves cache (which would bloat
 * memory in the common case). Instead we do a one-shot batch fetch
 * when the admin clicks "Lancer".
 *
 * React-Query handles caching: re-running with the same periode
 * uses cache until staleTime (5 min) or explicit invalidation.
 */

import { useMutation, useQuery } from '@tanstack/react-query'
import { collection, doc, getDoc, getDocs } from 'firebase/firestore'
import { db } from '@/firebase'
import {
  classesCol,
  elevesCol,
  bulletinDoc,
} from '@/lib/firestore-keys'
import { nomClasse } from '@/lib/benin'
import type { Classe, Eleve, Bulletin, Cycle, Serie } from '@/types/models'

const FIFTEEN_MIN = 15 * 60_000

export interface PalmaresEntry {
  eleveId: string
  nom: string
  genre: 'M' | 'F'
  classeId: string
  classeNom: string
  cycle: Cycle
  niveau: string
  serie: Serie | null
  moyenneGenerale: number
  /** Only populated for periode === 'Année' — read from perPeriodMoyennes */
  perPeriodMoyennes?: { periode: string; moyenne: number }[]
}

export interface PalmaresResult {
  /** All entries, sorted by moyenneGenerale desc */
  all: PalmaresEntry[]
  /** All entries for premier cycle, sorted desc */
  premierCycle: PalmaresEntry[]
  /** All entries for second cycle, sorted desc */
  secondCycle: PalmaresEntry[]
  /** Map of serie → sorted entries (second cycle only) */
  parSerie: Record<string, PalmaresEntry[]>
  /** Classes whose bulletins are not yet locked for this period */
  classesIncompletes: string[]
  /** Timestamp of this computation — useful for "Rafraîchi il y a X" */
  computedAt: number
  /** Whether this is the annual view (unlocks progression widgets) */
  isAnnual: boolean
}

/**
 * React-Query hook — call with a periode to trigger the fetch.
 * Pass `undefined` to disable. Results are cached by periode for
 * 15 minutes (admin can explicit-refresh via the Actualiser button).
 */
export function usePalmares(periode: string | undefined) {
  return useQuery({
    queryKey: ['palmares', periode ?? '(null)'],
    enabled: Boolean(periode),
    staleTime: FIFTEEN_MIN,
    queryFn: async () => {
      if (!periode) throw new Error('no periode')
      return computePalmares(periode)
    },
  })
}

/**
 * Exposed for manual "Relancer" buttons that want to bypass the
 * stale-time window.
 */
export function useRecomputePalmares() {
  return useMutation({
    mutationFn: async (periode: string) => computePalmares(periode),
  })
}

// ─── Core compute logic ──────────────────────────────────────

async function computePalmares(periode: string): Promise<PalmaresResult> {
  const isAnnual = periode === 'Année'

  // 1. Read all classes
  const classesSnap = await getDocs(collection(db, classesCol()))
  const classes: Classe[] = classesSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<Classe, 'id'>),
  }))

  const entries: PalmaresEntry[] = []
  const classesIncompletesSet = new Set<string>()

  // 2. For each class, fetch its eleves
  // Run class-loops in parallel — each class is independent; we can
  // iterate multiple classes concurrently. But per-class we read
  // eleves then each eleve's bulletin serially within the class to
  // stay kind to Firestore's read quotas.
  await Promise.all(
    classes.map(async (classe) => {
      const classeDisplay = nomClasse(classe)
      const elevesSnap = await getDocs(collection(db, elevesCol(classe.id)))
      if (elevesSnap.empty) return

      const eleves: Eleve[] = elevesSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Eleve, 'id'>),
      }))

      // 3. For each eleve, read the bulletin doc for this periode
      // Parallel within a class — typically 30-60 reads.
      const bulletinResults = await Promise.all(
        eleves.map(async (e) => {
          const snap = await getDoc(
            doc(db, bulletinDoc(classe.id, e.id, periode))
          )
          if (!snap.exists()) return null
          const data = snap.data() as Bulletin
          if (!data.estVerrouille) return null
          return { eleve: e, bulletin: data }
        })
      )

      // 4. Track "incomplete" classes — those with at least one
      //    unlocked or missing bulletin. This becomes the warning
      //    banner in the UI.
      const anyMissing = bulletinResults.some((r) => r === null)
      if (anyMissing) classesIncompletesSet.add(classeDisplay)

      // 5. Collect the locked ones
      for (const r of bulletinResults) {
        if (!r) continue
        entries.push({
          eleveId: r.eleve.id,
          nom: r.eleve.nom,
          genre: r.eleve.genre,
          classeId: classe.id,
          classeNom: classeDisplay,
          cycle: classe.cycle,
          niveau: classe.niveau,
          serie: classe.serie ?? null,
          moyenneGenerale: Number(r.bulletin.moyenneGenerale) || 0,
          // For annual bulletins, perPeriodMoyennes is already baked
          // in — free progression data with zero extra reads.
          perPeriodMoyennes: isAnnual ? r.bulletin.perPeriodMoyennes : undefined,
        })
      }
    })
  )

  // 6. Sort + group
  entries.sort((a, b) => b.moyenneGenerale - a.moyenneGenerale)
  const premierCycle = entries.filter((e) => e.cycle === 'premier')
  const secondCycle = entries.filter((e) => e.cycle === 'second')

  const parSerie: Record<string, PalmaresEntry[]> = {}
  for (const e of secondCycle) {
    const s = e.serie ?? 'Sans série'
    if (!parSerie[s]) parSerie[s] = []
    parSerie[s].push(e)
  }

  return {
    all: entries,
    premierCycle,
    secondCycle,
    parSerie,
    classesIncompletes: Array.from(classesIncompletesSet).sort((a, b) =>
      a.localeCompare(b, 'fr')
    ),
    computedAt: Date.now(),
    isAnnual,
  }
}

// ─── v2 aggregations (zero extra reads — derived from entries) ──

export interface ClasseRanking {
  classeId: string
  classeNom: string
  moyenneClasse: number
  nbEleves: number
  topMoyenne: number
}

/**
 * Rank classes by their average moyenne. Pure aggregation over the
 * already-fetched entries — no additional Firestore reads.
 */
export function rankClasses(entries: PalmaresEntry[]): ClasseRanking[] {
  const byClasse = new Map<string, PalmaresEntry[]>()
  for (const e of entries) {
    const arr = byClasse.get(e.classeId) ?? []
    arr.push(e)
    byClasse.set(e.classeId, arr)
  }

  const rankings: ClasseRanking[] = []
  for (const [classeId, list] of byClasse) {
    const sum = list.reduce((s, e) => s + e.moyenneGenerale, 0)
    const moyenneClasse = sum / list.length
    const topMoyenne = Math.max(...list.map((e) => e.moyenneGenerale))
    rankings.push({
      classeId,
      classeNom: list[0].classeNom,
      moyenneClasse: Math.round(moyenneClasse * 100) / 100,
      nbEleves: list.length,
      topMoyenne: Math.round(topMoyenne * 100) / 100,
    })
  }

  return rankings.sort((a, b) => b.moyenneClasse - a.moyenneClasse)
}

export interface DistributionBucket {
  label: string
  /** Inclusive lower bound */
  min: number
  /** Exclusive upper bound (last bucket is inclusive on both sides) */
  max: number
  count: number
}

/**
 * Bucket the entries into 8 grade ranges for the distribution
 * histogram. The buckets are tuned for the Béninois 0-20 scale where
 * < 10 = échec, ≥ 10 = passage, ≥ 14 = bien, ≥ 16 = très bien.
 */
export function bucketDistribution(entries: PalmaresEntry[]): DistributionBucket[] {
  const buckets: DistributionBucket[] = [
    { label: '0-4', min: 0, max: 5, count: 0 },
    { label: '5-7', min: 5, max: 8, count: 0 },
    { label: '8-9', min: 8, max: 10, count: 0 },
    { label: '10-11', min: 10, max: 12, count: 0 },
    { label: '12-13', min: 12, max: 14, count: 0 },
    { label: '14-15', min: 14, max: 16, count: 0 },
    { label: '16-17', min: 16, max: 18, count: 0 },
    { label: '18-20', min: 18, max: 21, count: 0 }, // inclusive of 20
  ]
  for (const e of entries) {
    const m = e.moyenneGenerale
    for (const b of buckets) {
      if (m >= b.min && m < b.max) {
        b.count++
        break
      }
    }
  }
  return buckets
}

export interface GenderStats {
  filles: number
  garcons: number
  /** % of filles in this set, rounded */
  pctFilles: number
}

/**
 * Compute gender split. Used in headers of ranking blocks to track
 * equity across cycles/séries.
 */
export function genderStats(entries: PalmaresEntry[]): GenderStats {
  if (entries.length === 0) return { filles: 0, garcons: 0, pctFilles: 0 }
  const filles = entries.filter((e) => e.genre === 'F').length
  const garcons = entries.length - filles
  const pctFilles = Math.round((filles / entries.length) * 100)
  return { filles, garcons, pctFilles }
}

/**
 * For an annual entry, compute the trajectory: first vs last period
 * moyenne, with delta. Only meaningful when perPeriodMoyennes is
 * populated (annual bulletin).
 */
export interface ProgressionInfo {
  first: number
  last: number
  delta: number
  /** 'up' | 'down' | 'flat' */
  trend: 'up' | 'down' | 'flat'
}

export function computeProgression(entry: PalmaresEntry): ProgressionInfo | null {
  const periods = entry.perPeriodMoyennes
  if (!periods || periods.length < 2) return null
  const first = periods[0].moyenne
  const last = periods[periods.length - 1].moyenne
  const delta = Math.round((last - first) * 100) / 100
  const trend: 'up' | 'down' | 'flat' =
    Math.abs(delta) < 0.5 ? 'flat' : delta > 0 ? 'up' : 'down'
  return { first, last, delta, trend }
}
