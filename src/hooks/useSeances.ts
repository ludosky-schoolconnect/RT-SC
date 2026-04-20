/**
 * RT-SC · Séances (emploi du temps) — read hook.
 *
 * Flat top-level collection /seances/{auto} with:
 *   { classeId, profId, matiere, matiereId?, jour, heureDebut, heureFin,
 *     salle?, anneeScolaireId, createdAt, createdBy, updatedAt? }
 *
 * Exposes a single live-snapshot hook. Consumers filter via useMemo:
 *   const { data: all = [] } = useAllSeances()
 *   const mine = useMemo(() => all.filter(s => s.profId === uid), [all, uid])
 *
 * This is simpler than exposing derived hooks because TanStack Query caches
 * by exact key — derived queries wouldn't auto-refresh when the base cache
 * updates. Memo in the consumer is the cleanest live-updating derivation.
 */

import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { collection, onSnapshot, query } from 'firebase/firestore'
import { db } from '@/firebase'
import { seancesCol } from '@/lib/firestore-keys'
import type { Seance } from '@/types/models'

const FIVE_MIN = 5 * 60_000

export function useAllSeances() {
  const qc = useQueryClient()

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, seancesCol())),
      (snap) => {
        const list: Seance[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Seance, 'id'>),
        }))
        qc.setQueryData(['seances', 'all'], list)
      },
      (err) => console.error('[useAllSeances] snapshot error:', err)
    )
    return unsub
  }, [qc])

  return useQuery<Seance[]>({
    queryKey: ['seances', 'all'],
    queryFn: async () => qc.getQueryData<Seance[]>(['seances', 'all']) ?? [],
    staleTime: FIVE_MIN,
  })
}
