/**
 * RT-SC · École sécurité — read hook.
 *
 * Reads /ecole/securite which contains the passkeyProf used in prof signup.
 * Cached for 1 minute since the admin can rotate it at any time.
 */

import { useQuery } from '@tanstack/react-query'
import { getDoc } from 'firebase/firestore'
import { docRef } from '@/firebase'
import { ecoleSecuriteDoc } from '@/lib/firestore-keys'
import type { SecuriteConfig } from '@/types/models'

export function useEcoleSecurite() {
  return useQuery<SecuriteConfig | null>({
    queryKey: ['ecole', 'securite'],
    queryFn: async () => {
      const snap = await getDoc(docRef(ecoleSecuriteDoc()))
      return snap.exists() ? (snap.data() as SecuriteConfig) : null
    },
    staleTime: 60_000,
  })
}
