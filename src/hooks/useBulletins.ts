/**
 * RT-SC · Bulletins — read hook.
 *
 * Lives at /classes/{cid}/eleves/{eid}/bulletins/{periode}
 * Doc id == period name (e.g. "Trimestre 1").
 *
 * Bulletins are computed and written by the closure flow (Phase 4c).
 * This hook only reads them — used by élève dashboard, parent portal,
 * and admin/PP detail views.
 */

import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '@/firebase'
import { bulletinsCol } from '@/lib/firestore-keys'
import type { Bulletin } from '@/types/models'

const FIVE_MIN = 5 * 60_000

export function useBulletins(classeId: string | undefined, eleveId: string | undefined) {
  const qc = useQueryClient()

  useEffect(() => {
    if (!classeId || !eleveId) return
    const unsub = onSnapshot(
      collection(db, bulletinsCol(classeId, eleveId)),
      (snap) => {
        const list: (Bulletin & { id: string })[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Bulletin),
        }))
        // Sort by period name — natural order works ("Trimestre 1" < "Trimestre 2")
        list.sort((a, b) => a.periode.localeCompare(b.periode))
        qc.setQueryData(['bulletins', classeId, eleveId], list)
      },
      (err) => console.error('[useBulletins] snapshot error:', err)
    )
    return unsub
  }, [classeId, eleveId, qc])

  return useQuery<(Bulletin & { id: string })[]>({
    queryKey: ['bulletins', classeId ?? 'none', eleveId ?? 'none'],
    enabled: !!classeId && !!eleveId,
    queryFn: async () =>
      qc.getQueryData<(Bulletin & { id: string })[]>(['bulletins', classeId, eleveId]) ?? [],
    staleTime: FIVE_MIN,
  })
}
