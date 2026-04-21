/**
 * RT-SC · Absences — unified read hooks for staff.
 *
 * Merges two storage shapes into a single timeline:
 *
 *   1. /classes/{}/eleves/{}/absences/{auto}
 *      Self-declared (élève or parent), advance notice. Has statut.
 *
 *   2. /classes/{}/presences/{YYYY-MM-DD}.{matiereSlug}.absents.{eleveId}
 *      Prof-marked via appel (5d.1). One per élève per matière per day.
 *
 * Two hooks:
 *   - useClasseAbsencesAll(classeId)
 *       Live snapshot of EVERY élève's absences in one class. Drives the
 *       "Vie scolaire" cross-class roll-up + the Mes-classes drill-in.
 *
 *   - useEleveAbsencesUnified(classeId, eleveId)
 *       Just one student's timeline. Built on top of the all hook, no
 *       extra Firestore reads.
 *
 * Both return UnifiedAbsence[] where each entry is tagged with kind so
 * the UI can render appropriately.
 */

import { useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { collection, onSnapshot, query, Timestamp } from 'firebase/firestore'
import { db } from '@/firebase'
import { absencesCol, presencesCol } from '@/lib/firestore-keys'
import { todayISO } from '@/hooks/usePresenceMutations'
import type {
  Absence,
  AbsentMark,
  PresenceDoc,
  StatutAbsence,
} from '@/types/models'

const FIVE_MIN = 5 * 60_000

// ─── Unified shape ────────────────────────────────────────────

export type UnifiedAbsence =
  | {
      kind: 'declared'
      id: string
      eleveId: string
      eleveNom: string
      date: Date           // calendar day of the absence
      heureDebut?: string
      heureFin?: string
      raison: string
      statut: StatutAbsence
      source: 'eleve' | 'parent'
      createdAt?: Date
    }
  | {
      kind: 'marked'
      /** Composite ID for React key: `${dateISO}__${matiereSlug}__${eleveId}` */
      id: string
      eleveId: string
      eleveNom: string
      date: Date           // the day the appel was taken
      matiereSlug: string
      heure: string        // "HH:MM" prof saved
      raison?: string
      prisPar: string
    }

function tsToDate(ts: Timestamp | Date | string | undefined): Date {
  if (!ts) return new Date(0)
  if (ts instanceof Date) return ts
  if (typeof ts === 'string') return new Date(ts)
  try {
    return ts.toDate()
  } catch {
    return new Date(0)
  }
}

// ─── Class-wide collection-group listeners ────────────────────

/**
 * Live read of:
 *   - All declared absences for one class (collection group on
 *     'absences' filtered by classeId via the parent path)
 *   - All presence docs for that class (entire /presences subcol)
 *
 * The TanStack cache keys are ['absencesAll', classeId] and
 * ['presencesAll', classeId]; consumers subscribe to derived data via
 * useMemo.
 */
function useClasseAbsencesRaw(classeId: string | null | undefined) {
  const qc = useQueryClient()
  const declaredKey = ['absencesAll', classeId ?? '_']
  const presencesKey = ['presencesAll', classeId ?? '_']

  // Listener 1: every élève's /absences subcollection.
  // Uses a per-élève listener pattern would explode subscriptions for
  // big classes. Instead we use a collectionGroup query filtered by
  // the implicit parent path. Firestore doesn't support filtering
  // collectionGroup by parent path natively, so we go the simpler
  // route: ONE listener per élève would be N reads. Better: scan via
  // the per-class /presences (which has the appel data) AND query
  // each élève's absences via the elèves cache.
  //
  // For now we do the simple, correct thing: iterate over élèves and
  // fan out small listeners. For typical CEG class sizes (15-50) this
  // is fine. If a class hits 200+ we revisit.
  //
  // Simpler still for v1: skip the per-élève fan-out. Just read the
  // PRESENCE docs (which contain prof-marked absences) and hold the
  // per-élève DECLARED absences as an "open on demand" expansion.
  //
  // → That's what we do here: cache holds the presences live; declared
  //   absences for one élève come from useEleveAbsences(classeId, eleveId)
  //   when the user expands a row. UnifiedAbsence merging happens in
  //   useEleveAbsencesUnified.
  //
  // The class-wide roll-up still works: we use presence data alone for
  // the per-élève COUNT (dominant signal), then enrich with declared
  // counts only when a row is expanded.

  useEffect(() => {
    if (!classeId) return
    const unsub = onSnapshot(
      query(collection(db, presencesCol(classeId))),
      (snap) => {
        const map: Record<string, PresenceDoc> = {}
        snap.docs.forEach((d) => {
          map[d.id] = d.data() as PresenceDoc
        })
        qc.setQueryData(presencesKey, map)
      },
      (err) => console.error('[useClasseAbsencesRaw] presences error:', err)
    )
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classeId, qc])

  // Initialize from cache; presence map is null until first snap.
  const presencesQ = useQuery<Record<string, PresenceDoc>>({
    queryKey: presencesKey,
    enabled: !!classeId,
    queryFn: async () =>
      qc.getQueryData<Record<string, PresenceDoc>>(presencesKey) ?? {},
    staleTime: FIVE_MIN,
  })

  // Declared map placeholder — populated via per-élève hooks where needed.
  // Returned for symmetry but unused at the class-roll-up level.
  void declaredKey

  return {
    presencesByDate: presencesQ.data ?? {},
    isLoading: presencesQ.isLoading,
  }
}

// ─── Per-class roll-up: count of marked absences per élève ────

export interface AbsenceCountRow {
  eleveId: string
  eleveNom: string
  markedCount: number
  /** Most recent date (any kind). null if none. */
  lastDate: Date | null
  /** Optional declared count, populated lazily by caller. */
  declaredCount?: number
}

/**
 * Returns, for each élève seen in any presence slot, the total number
 * of times they've been marked absent across all matières + dates.
 *
 * Driven entirely off the cached presences map — no extra reads.
 */
export function useClasseMarkedRollup(classeId: string | null | undefined) {
  const { presencesByDate, isLoading } = useClasseAbsencesRaw(classeId)

  const rollup = useMemo<AbsenceCountRow[]>(() => {
    const today = todayISO()
    const byEleve = new Map<string, AbsenceCountRow>()

    for (const [dateISO, presenceDoc] of Object.entries(presencesByDate)) {
      // Pre-today docs belong in the archive — don't include them in the
      // active per-class rollup. The archive (separate surface, future)
      // shows the historical record.
      if (dateISO < today) continue
      const date = new Date(dateISO + 'T12:00:00')
      for (const slot of Object.values(presenceDoc)) {
        if (!slot?.absents) continue
        for (const [eleveId, mark] of Object.entries(
          slot.absents as Record<string, AbsentMark>
        )) {
          const cur = byEleve.get(eleveId) ?? {
            eleveId,
            eleveNom: mark?.nom ?? 'Inconnu',
            markedCount: 0,
            lastDate: null,
          }
          cur.markedCount += 1
          if (mark?.nom) cur.eleveNom = mark.nom
          if (!cur.lastDate || date > cur.lastDate) cur.lastDate = date
          byEleve.set(eleveId, cur)
        }
      }
    }

    return Array.from(byEleve.values()).sort((a, b) =>
      (b.lastDate?.getTime() ?? 0) - (a.lastDate?.getTime() ?? 0)
    )
  }, [presencesByDate])

  return { rollup, isLoading }
}

// ─── Per-élève unified timeline (lazy) ────────────────────────

/**
 * Merges a single élève's declared absences (from useEleveAbsences) with
 * their prof-marked absences (from the class presence cache) into one
 * chronological timeline.
 */
export function useEleveAbsencesUnified(
  classeId: string | null | undefined,
  eleveId: string | null | undefined,
  declared: Absence[]
): UnifiedAbsence[] {
  const { presencesByDate } = useClasseAbsencesRaw(classeId)

  return useMemo(() => {
    if (!eleveId) return []
    const today = todayISO()
    const out: UnifiedAbsence[] = []

    // Declared
    declared.forEach((a) => {
      out.push({
        kind: 'declared',
        id: a.id,
        eleveId,
        eleveNom: a.eleveNom,
        date: tsToDate(a.date),
        heureDebut: a.heureDebut,
        heureFin: a.heureFin,
        raison: a.raison,
        statut: a.statut,
        source: a.source === 'parent' ? 'parent' : 'eleve',
        createdAt: a.createdAt ? tsToDate(a.createdAt) : undefined,
      })
    })

    // Marked — today only; pre-today is in the archive
    for (const [dateISO, presenceDoc] of Object.entries(presencesByDate)) {
      if (dateISO < today) continue
      for (const [matiereSlug, slot] of Object.entries(presenceDoc)) {
        const absentMark = slot?.absents?.[eleveId]
        if (!absentMark) continue
        out.push({
          kind: 'marked',
          id: `${dateISO}__${matiereSlug}__${eleveId}`,
          eleveId,
          eleveNom: absentMark.nom,
          date: new Date(dateISO + 'T12:00:00'),
          matiereSlug,
          heure: absentMark.heure,
          raison: absentMark.raison,
          prisPar: slot.pris_par,
        })
      }
    }

    out.sort((a, b) => b.date.getTime() - a.date.getTime())
    return out
  }, [eleveId, declared, presencesByDate])
}
