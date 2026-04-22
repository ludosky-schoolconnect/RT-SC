/**
 * RT-SC · Absences — school-wide read hook (admin triage).
 *
 * Uses Firestore's collectionGroup('absences') to fetch every declared
 * absence across the entire school in a single live listener. Only
 * accessible to staff (rule: `match /{path=**}/absences/{absenceId}
 * { allow read: if isStaff(); }`).
 *
 * The doc references include parent path info, so we extract classeId
 * and eleveId from the path string. Each enriched record carries
 * everything the triage table needs to display + act on without extra
 * lookups.
 *
 * 14-DAY DISPLAY WINDOW
 * Declarations older than 14 days are filtered OUT of the rendered
 * list (never displayed in triage — admin's triage view is meant to
 * stay recent). The actual DELETE of those stale docs is handled
 * server-side by the weekly Cloud Function `weeklyStaleAbsencesCleanup`
 * (Session C). This hook used to run a client-side batch-delete as a
 * belt-and-suspenders measure, but the scheduled function makes that
 * redundant and removes a known race condition against admin's manual
 * delete clicks (Firestore persistent-cache assertion errors).
 *
 * Note: this is the SELF-DECLARED feed only. Prof-marked absences
 * (from /presences) live in a different shape and aren't merged here
 * — admin triage is about reviewing declarations, not appel results.
 */

import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  collectionGroup,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore'
import { db } from '@/firebase'
import { parseLiveElevePath } from '@/lib/firestore-keys'
import type { Absence } from '@/types/models'

const FIVE_MIN = 5 * 60_000
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000

export interface SchoolAbsence extends Absence {
  classeId: string
  eleveId: string
}

function tsToMillis(ts: unknown): number {
  if (!ts) return 0
  if (typeof (ts as { toMillis?: () => number }).toMillis === 'function') {
    return (ts as { toMillis: () => number }).toMillis()
  }
  if (ts instanceof Date) return ts.getTime()
  return 0
}

export function useSchoolAbsences() {
  const qc = useQueryClient()
  const key = ['absencesSchool']

  useEffect(() => {
    const unsub = onSnapshot(
      query(collectionGroup(db, 'absences'), orderBy('date', 'desc')),
      (snap) => {
        const cutoff = Date.now() - FOURTEEN_DAYS_MS
        const fresh: SchoolAbsence[] = []

        snap.docs.forEach((d) => {
          const parsed = parseLiveElevePath(d.ref.path, 'absences')
          // Skip archive paths — they surface via the Année tab's
          // dedicated archive browser, not the live triage view.
          if (!parsed) return
          const { classeId, eleveId } = parsed
          const data = d.data() as Omit<Absence, 'id'>

          // Display filter: exclude anything older than 14 days from
          // the triage list. The server-side scheduled cleanup
          // (weeklyStaleAbsencesCleanup) eventually deletes them from
          // Firestore — between now and the next Sunday run they just
          // won't render.
          const refMillis =
            tsToMillis(data.createdAt) || tsToMillis(data.date)
          if (refMillis && refMillis < cutoff) return

          fresh.push({
            id: d.id,
            classeId,
            eleveId,
            ...data,
          })
        })

        qc.setQueryData(key, fresh)
      },
      (err) => console.error('[useSchoolAbsences] snapshot error:', err)
    )
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc])

  return useQuery<SchoolAbsence[]>({
    queryKey: key,
    queryFn: async () => qc.getQueryData<SchoolAbsence[]>(key) ?? [],
    staleTime: FIVE_MIN,
  })
}
