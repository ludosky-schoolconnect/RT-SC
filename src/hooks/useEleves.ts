/**
 * RT-SC · Élèves — read hooks (live snapshot per class).
 *
 * One subscription per class — only opened when a class is actually selected
 * in the UI. Cleaned up on unmount.
 */

import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore'
import { db } from '@/firebase'
import { elevesCol } from '@/lib/firestore-keys'
import type { Eleve } from '@/types/models'

const FIVE_MIN = 5 * 60_000

export function useEleves(classeId: string | undefined) {
  const qc = useQueryClient()

  useEffect(() => {
    if (!classeId) return
    const unsub = onSnapshot(
      query(collection(db, elevesCol(classeId)), orderBy('nom', 'asc')),
      (snap) => {
        const list: Eleve[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Eleve, 'id'>),
        }))
        qc.setQueryData(['eleves', classeId], list)
      },
      (err) => console.error('[useEleves] snapshot error:', err)
    )
    return unsub
  }, [classeId, qc])

  return useQuery<Eleve[]>({
    queryKey: ['eleves', classeId ?? 'none'],
    enabled: !!classeId,
    queryFn: async () =>
      qc.getQueryData<Eleve[]>(['eleves', classeId]) ?? [],
    staleTime: FIVE_MIN,
  })
}
