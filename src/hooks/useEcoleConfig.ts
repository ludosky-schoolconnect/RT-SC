/**
 * RT-SC · École config — read hook.
 *
 * Reads /ecole/config which contains anneeActive, school name, etc.
 * Cached for 15 minutes (rarely changes).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getDoc, setDoc } from 'firebase/firestore'
import { docRef } from '@/firebase'
import { ecoleConfigDoc } from '@/lib/firestore-keys'
import type { EcoleConfig } from '@/types/models'

const FIFTEEN_MIN = 15 * 60_000

export function useEcoleConfig() {
  return useQuery({
    queryKey: ['ecole', 'config'],
    queryFn: async (): Promise<EcoleConfig | null> => {
      const snap = await getDoc(docRef(ecoleConfigDoc()))
      return snap.exists() ? (snap.data() as EcoleConfig) : null
    },
    staleTime: FIFTEEN_MIN,
  })
}

export function useUpdateEcoleConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patch: Partial<EcoleConfig>) => {
      await setDoc(docRef(ecoleConfigDoc()), patch, { merge: true })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ecole', 'config'] })
    },
  })
}
