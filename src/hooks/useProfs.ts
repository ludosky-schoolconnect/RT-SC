/**
 * RT-SC · Professeurs — read hook (live snapshot).
 *
 * Subscribes to the entire professeurs collection. Updates land instantly
 * when any admin approves/rejects/edits a prof from any device.
 *
 * Cache: shared across the app via TanStack Query so re-renders are cheap.
 */

import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore'
import { db } from '@/firebase'
import { professeursCol } from '@/lib/firestore-keys'
import type { Professeur } from '@/types/models'

const FIVE_MIN = 5 * 60_000

export function useProfs() {
  const qc = useQueryClient()

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, professeursCol()), orderBy('nom', 'asc')),
      (snap) => {
        const list: Professeur[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Professeur, 'id'>),
        }))
        qc.setQueryData(['profs'], list)
      },
      (err) => console.error('[useProfs] snapshot error:', err)
    )
    return unsub
  }, [qc])

  return useQuery<Professeur[]>({
    queryKey: ['profs'],
    queryFn: async () => qc.getQueryData<Professeur[]>(['profs']) ?? [],
    staleTime: FIVE_MIN,
  })
}
