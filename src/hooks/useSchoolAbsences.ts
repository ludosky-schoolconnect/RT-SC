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
import { absenceDoc, parseLiveElevePath } from '@/lib/firestore-keys'
import type { Absence } from '@/types/models'

const FIVE_MIN = 5 * 60_000
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000

export interface SchoolAbsence extends Absence {
  classeId: string
  eleveId: string
}

/**
 * Path-shape filter delegated to the shared `parseLiveElevePath` helper
 * in firestore-keys (returns null for archive paths, etc.) — see that
 * function for the canonical live-vs-archive distinction.
 */

/**
 * Session-scoped set of absence IDs we've already attempted to delete.
 * Prevents re-firing delete writes for the same stale doc on every snap
 * batch (Firestore often delivers multiple snaps in quick succession
 * during initial load).
 *
 * Plus: a session-wide flag so auto-cleanup runs AT MOST ONCE per page
 * load, deferred to after initial render. Firing deletes inside the
 * snapshot callback races against admin's manual delete clicks and
 * triggers Firestore's persistent-cache layer to throw "INTERNAL
 * ASSERTION FAILED: Unexpected state". Once-per-session + deferred +
 * serialized eliminates the collision window.
 */
const cleanupAttempted = new Set<string>()
let cleanupRanThisSession = false

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
        const stalePaths: Array<{ classeId: string; eleveId: string; id: string }> = []

        snap.docs.forEach((d) => {
          const parsed = parseLiveElevePath(d.ref.path, 'absences')
          // Skip archive paths — they surface via the Année tab's
          // dedicated archive browser, not the live triage view.
          if (!parsed) return
          const { classeId, eleveId } = parsed
          const data = d.data() as Omit<Absence, 'id'>

          // 14-day cleanup — collect stale doc paths but DON'T fire
          // delete writes inside the snapshot callback. Firing deletes
          // here races with admin's manual delete clicks and triggers
          // Firestore's persistent-cache assertion. We batch them up
          // and run once, deferred, below.
          const refMillis =
            tsToMillis(data.createdAt) || tsToMillis(data.date)
          if (refMillis && refMillis < cutoff) {
            if (!cleanupAttempted.has(d.id)) {
              stalePaths.push({ classeId, eleveId, id: d.id })
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

        // Deferred, once-per-session, serialized cleanup. Only the FIRST
        // snap that detects stale docs triggers the cleanup pass.
        if (!cleanupRanThisSession && stalePaths.length > 0) {
          cleanupRanThisSession = true
          // Long delay: UI has time to paint and any user click-then-
          // delete will have completed before background cleanup starts.
          setTimeout(() => {
            // Serial (await each before next) so the persistent cache
            // layer never sees concurrent writes to adjacent docs.
            void (async () => {
              for (const { classeId, eleveId, id } of stalePaths) {
                cleanupAttempted.add(id)
                try {
                  await deleteDoc(doc(db, absenceDoc(classeId, eleveId, id)))
                } catch (err) {
                  console.warn('[useSchoolAbsences] cleanup skipped:', err)
                }
              }
            })()
          }, 5000)
        }
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
