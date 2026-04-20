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
 * 14-DAY AUTO-CLEANUP
 * Matches the legacy SC behavior: when the snapshot loads, any
 * declaration older than 14 days (by createdAt or fallback to date)
 * is silently deleted. Prevents Firestore bloat over a school year
 * (~1000+ dead docs after 6 months otherwise). Runs at most once per
 * snapshot batch, deduped via a session-scoped Set.
 *
 * Note: this is the SELF-DECLARED feed only. Prof-marked absences
 * (from /presences) live in a different shape and aren't merged here
 * — admin triage is about reviewing declarations, not appel results.
 */

import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  collectionGroup,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore'
import { db } from '@/firebase'
import { absenceDoc } from '@/lib/firestore-keys'
import type { Absence } from '@/types/models'

const FIVE_MIN = 5 * 60_000
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000

export interface SchoolAbsence extends Absence {
  classeId: string
  eleveId: string
}

/** Parse "classes/{cId}/eleves/{eId}/absences/{aId}" into { classeId, eleveId }. */
function parseAbsencePath(path: string): { classeId: string; eleveId: string } {
  const parts = path.split('/')
  // Expected: ['classes', cId, 'eleves', eId, 'absences', aId]
  return {
    classeId: parts[1] ?? '',
    eleveId: parts[3] ?? '',
  }
}

/**
 * Session-scoped set of absence IDs we've already attempted to delete.
 * Prevents re-firing delete writes for the same stale doc on every snap
 * batch (Firestore often delivers multiple snaps in quick succession
 * during initial load).
 */
const cleanupAttempted = new Set<string>()

function tsToMillis(ts: unknown): number {
  if (!ts) return 0
  // Firestore Timestamp
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
          const { classeId, eleveId } = parseAbsencePath(d.ref.path)
          const data = d.data() as Omit<Absence, 'id'>

          // 14-day cleanup — fire-and-forget delete for stale docs
          const refMillis =
            tsToMillis(data.createdAt) || tsToMillis(data.date)
          if (refMillis && refMillis < cutoff) {
            if (!cleanupAttempted.has(d.id)) {
              cleanupAttempted.add(d.id)
              deleteDoc(doc(db, absenceDoc(classeId, eleveId, d.id))).catch(
                (err) => {
                  // Don't block the UI on permission errors etc.
                  console.warn('[useSchoolAbsences] cleanup skipped:', err)
                }
              )
            }
            return // exclude stale docs from the rendered list
          }

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
