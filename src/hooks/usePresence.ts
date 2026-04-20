/**
 * RT-SC · Présences (appel) — read hook.
 *
 * Reads /classes/{classeId}/presences/{YYYY-MM-DD} live. The doc shape:
 *   { [matiereSlug]: PresenceSlot }
 *
 * One subscription per (class, date) pair. Most of the time, the prof opens
 * an appel and only ONE date is being watched. Closing the appel detaches.
 *
 * Returns { data, isLoading } where data is `null` if the document doesn't
 * exist (no appel taken for that day yet) or the parsed PresenceDoc.
 */

import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { onSnapshot } from 'firebase/firestore'
import { docRef } from '@/firebase'
import { presenceDoc } from '@/lib/firestore-keys'
import type { PresenceDoc } from '@/types/models'

const FIVE_MIN = 5 * 60_000

export function usePresenceDoc(
  classeId: string | null | undefined,
  dateISO: string | null | undefined
) {
  const qc = useQueryClient()
  const key = ['presence', classeId ?? '_', dateISO ?? '_']

  useEffect(() => {
    if (!classeId || !dateISO) return
    const unsub = onSnapshot(
      docRef(presenceDoc(classeId, dateISO)),
      (snap) => {
        const data = snap.exists() ? (snap.data() as PresenceDoc) : null
        qc.setQueryData(key, data)
      },
      (err) => console.error('[usePresenceDoc] snapshot error:', err)
    )
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classeId, dateISO, qc])

  return useQuery<PresenceDoc | null>({
    queryKey: key,
    enabled: !!(classeId && dateISO),
    queryFn: async () => qc.getQueryData<PresenceDoc | null>(key) ?? null,
    staleTime: FIVE_MIN,
  })
}
