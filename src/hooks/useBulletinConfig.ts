/**
 * RT-SC · Bulletin config — read + write hook.
 * Stored at /ecole/bulletinConfig.
 *
 * Default fallback when doc doesn't exist:
 *   typePeriode: 'Trimestre'
 *   nbPeriodes: 3
 *   baseConduite: 20
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getDoc, setDoc } from 'firebase/firestore'
import { docRef } from '@/firebase'
import { ecoleBulletinConfigDoc } from '@/lib/firestore-keys'
import type { BulletinConfig } from '@/types/models'

const DEFAULTS: BulletinConfig = {
  typePeriode: 'Trimestre',
  nbPeriodes: 3,
  baseConduite: 20,
}

export function useBulletinConfig() {
  return useQuery<BulletinConfig>({
    queryKey: ['ecole', 'bulletinConfig'],
    queryFn: async () => {
      const snap = await getDoc(docRef(ecoleBulletinConfigDoc()))
      if (!snap.exists()) return DEFAULTS
      const data = snap.data() as Partial<BulletinConfig>
      return {
        typePeriode: data.typePeriode ?? DEFAULTS.typePeriode,
        nbPeriodes: data.nbPeriodes ?? DEFAULTS.nbPeriodes,
        baseConduite: data.baseConduite ?? DEFAULTS.baseConduite,
      }
    },
    staleTime: 10 * 60_000,
  })
}

export function useUpdateBulletinConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patch: Partial<BulletinConfig>) => {
      await setDoc(docRef(ecoleBulletinConfigDoc()), patch, { merge: true })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ecole', 'bulletinConfig'] })
    },
  })
}
