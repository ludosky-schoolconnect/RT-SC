/**
 * RT-SC · Civisme history hook (Phase 3b).
 *
 * Reads the audit trail at /classes/{cid}/eleves/{eid}/civismeHistory.
 * Live snapshot listener — when admin validates a quest or fulfills
 * a reclamation or reports an incident, the student/parent sees the
 * new entry immediately.
 *
 * Used by:
 *   - Student Historique section (last N entries)
 *   - Parent Accueil widget (last 3 entries)
 *   - Admin drilldown if we add one later
 */

import { useEffect } from 'react'
import {
  collection,
  limit as fsLimit,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { db } from '@/firebase'
import { civismeHistoryCol } from '@/lib/firestore-keys'
import type { CivismeHistoryEntry } from '@/types/models'

const FIVE_MIN = 5 * 60_000

// Track which query keys have received their first snapshot, so we
// can hold isLoading=true until real data arrives.
const firstSnapshotSeen = new Set<string>()

export function useCivismeHistory(
  classeId: string | undefined,
  eleveId: string | undefined,
  maxEntries = 10
) {
  const qc = useQueryClient()
  const key = ['civismeHistory', classeId ?? '(none)', eleveId ?? '(none)', maxEntries]
  const keyId = JSON.stringify(key)

  useEffect(() => {
    if (!classeId || !eleveId) return
    const unsub = onSnapshot(
      query(
        collection(db, civismeHistoryCol(classeId, eleveId)),
        orderBy('date', 'desc'),
        fsLimit(maxEntries)
      ),
      (snap) => {
        const list: CivismeHistoryEntry[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<CivismeHistoryEntry, 'id'>),
        }))
        qc.setQueryData(key, list)
        firstSnapshotSeen.add(keyId)
      },
      (err) => {
        console.error('[useCivismeHistory] snapshot error:', err)
        firstSnapshotSeen.add(keyId)
        qc.setQueryData(key, [])
        qc.invalidateQueries({ queryKey: key })
      }
    )
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classeId, eleveId, maxEntries])

  return useQuery<CivismeHistoryEntry[]>({
    queryKey: key,
    queryFn: async () => {
      const cached = qc.getQueryData<CivismeHistoryEntry[]>(key)
      if (cached !== undefined) return cached
      if (firstSnapshotSeen.has(keyId)) return []
      return new Promise<CivismeHistoryEntry[]>(() => {})
    },
    enabled: Boolean(classeId && eleveId),
    staleTime: FIVE_MIN,
  })
}
