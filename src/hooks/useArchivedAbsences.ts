/**
 * RT-SC · Archived absences — read hook.
 *
 * Queries /archived_absences/ with a date range window. Live snapshot
 * (onSnapshot) so if the daily roll-over runs while admin is viewing
 * the archive, new entries appear automatically.
 *
 * Date range is REQUIRED — the archive is potentially unbounded, so
 * we never load "everything ever" by default. Admin's default range
 * is "last 30 days" from the UI layer.
 *
 * Indexed on: `date` (already covered by default Firestore indexing
 * on the single-field queryable). For class+matière filters we query
 * all docs in range and filter client-side — faster path than building
 * composite indexes, and admin's typical range (30-90 days) stays
 * comfortably small in memory.
 */

import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
} from 'firebase/firestore'
import { db } from '@/firebase'
import { archivedAbsencesCol } from '@/lib/firestore-keys'
import type { ArchivedAbsence } from '@/types/models'

const FIVE_MIN = 5 * 60_000

export interface ArchiveRange {
  /** Inclusive start (local midnight). */
  from: Date
  /** Inclusive end (local end-of-day). */
  to: Date
}

export function useArchivedAbsences(range: ArchiveRange) {
  const qc = useQueryClient()
  const key = [
    'archivedAbsences',
    range.from.toISOString(),
    range.to.toISOString(),
  ]

  useEffect(() => {
    const fromTs = Timestamp.fromDate(range.from)
    const toTs = Timestamp.fromDate(range.to)
    const unsub = onSnapshot(
      query(
        collection(db, archivedAbsencesCol()),
        where('date', '>=', fromTs),
        where('date', '<=', toTs),
        orderBy('date', 'desc')
      ),
      (snap) => {
        const list: ArchivedAbsence[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ArchivedAbsence, 'id'>),
        }))
        qc.setQueryData(key, list)
      },
      (err) => console.error('[useArchivedAbsences] snapshot error:', err)
    )
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from.getTime(), range.to.getTime(), qc])

  return useQuery<ArchivedAbsence[]>({
    queryKey: key,
    queryFn: async () => qc.getQueryData<ArchivedAbsence[]>(key) ?? [],
    staleTime: FIVE_MIN,
  })
}
