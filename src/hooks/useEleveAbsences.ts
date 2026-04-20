/**
 * RT-SC · Absences — read hook for ONE élève.
 *
 * Reads /classes/{classeId}/eleves/{eleveId}/absences live, sorted newest
 * first. Used by the élève and parent "Mes absences" tabs.
 *
 * Note: this only returns SELF-DECLARED absences. Prof-marked absences
 * live in /classes/{}/presences/{date} which is a different shape (per-day,
 * per-matière). To merge both for a unified view, see useEleveAbsencesUnified
 * in a future hook.
 */

import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore'
import { db } from '@/firebase'
import { absencesCol } from '@/lib/firestore-keys'
import type { Absence } from '@/types/models'

const FIVE_MIN = 5 * 60_000

export function useEleveAbsences(
  classeId: string | null | undefined,
  eleveId: string | null | undefined
) {
  const qc = useQueryClient()
  const key = ['absences', classeId ?? '_', eleveId ?? '_']

  useEffect(() => {
    if (!classeId || !eleveId) return
    const unsub = onSnapshot(
      query(
        collection(db, absencesCol(classeId, eleveId)),
        orderBy('date', 'desc')
      ),
      (snap) => {
        const list: Absence[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Absence, 'id'>),
        }))
        qc.setQueryData(key, list)
      },
      (err) => console.error('[useEleveAbsences] snapshot error:', err)
    )
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classeId, eleveId, qc])

  return useQuery<Absence[]>({
    queryKey: key,
    enabled: !!(classeId && eleveId),
    queryFn: async () => qc.getQueryData<Absence[]>(key) ?? [],
    staleTime: FIVE_MIN,
  })
}
