/**
 * RT-SC · useClassPeriodEnrichment.
 *
 * Fetches the class-wide data needed to enrich a bulletin view for
 * Bulletin v2. Scoped to ONE (class × period) and cached by that key,
 * so all 30+ students in the same class × period share a single fetch.
 *
 * What it fetches (in parallel where possible):
 *   1. All active students in the class (for `effectif` count)
 *   2. Each classmate's bulletin for the given period
 *   3. Each classmate's notes for the given period
 *   4. All presence docs for the class within the period date range
 *      (for prof-appel absences + retards)
 *
 * What it does NOT fetch (deferred to per-student hook):
 *   - The current student's own /absences subcollection (declared)
 *   - The current student's /colles
 *   - The current student's /civismeHistory
 *   Those are per-student and better batched with the base view hook.
 *
 * Cost profile for a 30-student class:
 *   - 1 classmates-list read
 *   - 30 bulletin reads
 *   - 30 notes-query reads (each returns ~15 docs; one query per student
 *     to avoid composite-index gymnastics on collectionGroup)
 *   - 1 presences-range query (~60-90 docs for a trimester)
 *   Total ≈ 60-100 reads per class × period. Cached 5 min.
 *
 * A future optimization would consolidate bulletin+notes into fewer
 * round-trips via collectionGroup queries with a classeId filter, but
 * that requires schema changes (adding classeId to notes + bulletins).
 * Not worth doing now; the current reads are well inside Blaze free tier.
 */

import { useQuery } from '@tanstack/react-query'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore'
import { db } from '@/firebase'
import {
  bulletinsCol,
  elevesCol,
  notesCol,
  presencesCol,
} from '@/lib/firestore-keys'
import { useBulletinConfig } from './useBulletinConfig'
import type {
  Bulletin,
  Eleve,
  Note,
  Periode,
  PresenceDoc,
} from '@/types/models'
import type {
  ClassmateBulletinData,
  DisciplineSourceData,
} from '@/lib/bulletinEnrichment'

const FIVE_MIN = 5 * 60_000

/**
 * The payload every consumer needs. Shared between all students in the
 * class — the per-student enrichment filters from this into
 * `DisciplineSourceData['presences']`.
 */
export interface ClassPeriodEnrichment {
  effectif: number
  classmates: ClassmateBulletinData[]
  /** All presence docs in the period, pre-extracted to the shape the
   *  enricher expects (dateISO + matiereSlug + absents/retards id lists). */
  presences: DisciplineSourceData['presences']
}

// ─── Helpers ──────────────────────────────────────────────────

/**
 * Given a bulletin config, return the date range for a named period.
 * Falls back to "full year" if the dates aren't configured.
 */
function periodDateBounds(
  periode: Periode,
  periodeDates: Record<string, { debut: string; fin: string }> | undefined
): { debut: string | null; fin: string | null } {
  const r = periodeDates?.[periode]
  if (!r) return { debut: null, fin: null }
  return { debut: r.debut, fin: r.fin }
}

/**
 * Flatten a PresenceDoc's matière slots into a list of per-matière
 * entries. Each matière slot has its own `absents` and `retards` maps.
 * The enricher only needs the ID lists, not the full mark data.
 */
function flattenPresenceDoc(
  dateISO: string,
  data: PresenceDoc
): DisciplineSourceData['presences'] {
  const rows: DisciplineSourceData['presences'] = []
  for (const [matiereSlug, slot] of Object.entries(data)) {
    if (!slot || typeof slot !== 'object') continue
    const absentsIds = Object.keys(slot.absents ?? {})
    const retardsIds = Object.keys(slot.retards ?? {})
    if (absentsIds.length === 0 && retardsIds.length === 0) continue
    rows.push({ dateISO, matiereSlug, absentsIds, retardsIds })
  }
  return rows
}

// ─── Hook ──────────────────────────────────────────────────

export function useClassPeriodEnrichment(args: {
  classeId: string | undefined
  periode: Periode | undefined
}) {
  const { classeId, periode } = args
  const { data: bulletinConfig } = useBulletinConfig()

  const enabled = !!classeId && !!periode && !!bulletinConfig

  return useQuery<ClassPeriodEnrichment | null>({
    queryKey: ['class-period-enrichment', classeId, periode],
    enabled,
    staleTime: FIVE_MIN,
    queryFn: async () => {
      if (!classeId || !periode || !bulletinConfig) return null

      // 1. All students in the class
      const elevesSnap = await getDocs(collection(db, elevesCol(classeId)))
      const eleves = elevesSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Eleve, 'id'>),
      }))
      const effectif = eleves.length

      // 2 + 3. In parallel: each classmate's bulletin + notes for this period
      const classmatesPromises = eleves.map(async (eleve) => {
        const [bullSnap, notesSnap] = await Promise.all([
          getDoc(doc(db, `${bulletinsCol(classeId, eleve.id)}/${periode}`)),
          getDocs(
            query(
              collection(db, notesCol(classeId, eleve.id)),
              where('periode', '==', periode)
            )
          ),
        ])
        if (!bullSnap.exists()) return null
        const bulletin = bullSnap.data() as Bulletin
        const notes = notesSnap.docs.map((n) => n.data() as Note)
        return {
          eleveId: eleve.id,
          genre: eleve.genre,
          bulletin,
          notes,
        } satisfies ClassmateBulletinData
      })

      const classmateResults = await Promise.all(classmatesPromises)
      const classmates = classmateResults.filter(
        (c): c is ClassmateBulletinData => c !== null
      )

      // 4. Presences for the class within the period date range
      //    We fetch ALL presences for the class and filter client-side by
      //    dateISO string (< fin, >= debut). Firestore's `where('__name__',
      //    '>=', X)` on doc IDs is brittle; dateISO strings sort
      //    lexicographically the same as chronologically when formatted
      //    YYYY-MM-DD, so a simple range compare works without needing a
      //    composite index. Class presences are typically a few hundred
      //    docs max per year — safe to scan.
      const { debut, fin } = periodDateBounds(periode, bulletinConfig.periodeDates)
      const presencesSnap = await getDocs(collection(db, presencesCol(classeId)))
      const presencesRaw: DisciplineSourceData['presences'] = []
      for (const pSnap of presencesSnap.docs) {
        const dateISO = pSnap.id
        if (debut && dateISO < debut) continue
        if (fin && dateISO > fin) continue
        const data = pSnap.data() as PresenceDoc
        presencesRaw.push(...flattenPresenceDoc(dateISO, data))
      }

      return {
        effectif,
        classmates,
        presences: presencesRaw,
      }
    },
  })
}
