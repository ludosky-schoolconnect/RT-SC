/**
 * RT-SC · School-wide prof-marked absences (admin triage).
 *
 * Companion to useSchoolAbsences (which reads /eleves/{}/absences/ for
 * self-declared events). This one reads /classes/{}/presences/ via
 * collectionGroup, parses each per-day-per-matière slot, and emits one
 * UnifiedAbsence per (élève, matière, date) where the élève is in
 * slot.absents{}.
 *
 * Admin's Triage école merges both feeds chronologically so all of a
 * day's absences — declared OR marked — show up in one place.
 *
 * Firestore rule: `match /{path=**}/presences/{date} { allow read: if
 * isStaff(); }` — your existing top-level presences rule covers it via
 * the `=**` wildcard. (If admin sees no marked absences after applying
 * this patch, that rule may need to be added; see PHASE notes.)
 */

import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  collectionGroup,
  onSnapshot,
  query,
} from 'firebase/firestore'
import { db } from '@/firebase'
import { todayISO } from '@/hooks/usePresenceMutations'
import type { AbsentMark, PresenceDoc } from '@/types/models'

const FIVE_MIN = 5 * 60_000

export interface SchoolMarkedAbsence {
  /** Composite ID for React keys: `${classeId}__${dateISO}__${matiereSlug}__${eleveId}` */
  id: string
  classeId: string
  dateISO: string
  date: Date
  matiereSlug: string
  eleveId: string
  eleveNom: string
  heure: string
  raison?: string
  prisPar: string
}

/** Parse "classes/{cId}/presences/{dateISO}" into { classeId, dateISO }. */
function parsePresencePath(path: string): { classeId: string; dateISO: string } {
  const parts = path.split('/')
  // Expected: ['classes', cId, 'presences', dateISO]
  return {
    classeId: parts[1] ?? '',
    dateISO: parts[3] ?? '',
  }
}

export function useSchoolMarkedAbsences() {
  const qc = useQueryClient()
  const key = ['markedAbsencesSchool']

  useEffect(() => {
    const unsub = onSnapshot(
      query(collectionGroup(db, 'presences')),
      (snap) => {
        const today = todayISO()
        const list: SchoolMarkedAbsence[] = []
        snap.docs.forEach((d) => {
          const { classeId, dateISO } = parsePresencePath(d.ref.path)
          // Skip pre-today docs — they belong in the archive (rolled over
          // by useArchiveRollover the next time admin opens triage).
          if (dateISO < today) return
          const presenceDoc = d.data() as PresenceDoc
          for (const [matiereSlug, slot] of Object.entries(presenceDoc)) {
            const absents = (slot?.absents ?? {}) as Record<string, AbsentMark>
            for (const [eleveId, mark] of Object.entries(absents)) {
              list.push({
                id: `${classeId}__${dateISO}__${matiereSlug}__${eleveId}`,
                classeId,
                dateISO,
                date: new Date(dateISO + 'T12:00:00'),
                matiereSlug,
                eleveId,
                eleveNom: mark?.nom ?? 'Inconnu',
                heure: mark?.heure ?? '',
                raison: mark?.raison,
                prisPar: slot.pris_par ?? '—',
              })
            }
          }
        })
        // Sort newest first
        list.sort((a, b) => b.date.getTime() - a.date.getTime())
        qc.setQueryData(key, list)
      },
      (err) => console.error('[useSchoolMarkedAbsences] snapshot error:', err)
    )
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc])

  return useQuery<SchoolMarkedAbsence[]>({
    queryKey: key,
    queryFn: async () => qc.getQueryData<SchoolMarkedAbsence[]>(key) ?? [],
    staleTime: FIVE_MIN,
  })
}
