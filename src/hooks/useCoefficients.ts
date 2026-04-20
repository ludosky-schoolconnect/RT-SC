/**
 * RT-SC · Coefficients — read + write per (niveau, série) document.
 *
 * Storage: /ecole/coefficients_{niveau}-{serie|null}
 *   e.g. /ecole/coefficients_3ème-null  (premier cycle, no série)
 *        /ecole/coefficients_Terminale-D
 *
 * Doc shape: { [matiere: string]: number }
 *   e.g. { 'Mathématiques': 4, 'Français': 3, 'Conduite': 1 }
 *
 * Why per-doc rather than one big map: matches legacy structure (no
 * migration needed) and lets multiple classes of the same level/série
 * share one coefficient set without duplication.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getDoc, setDoc } from 'firebase/firestore'
import { docRef } from '@/firebase'
import { ecoleCoefficientsDoc } from '@/lib/firestore-keys'
import { coefficientsTargetId } from '@/lib/benin'
import type { CoefficientsDoc, Niveau, Serie } from '@/types/models'

const TEN_MIN = 10 * 60_000

export function useCoefficients(niveau: Niveau | null, serie: Serie | null) {
  const targetId = niveau ? coefficientsTargetId(niveau, serie) : null
  return useQuery<CoefficientsDoc>({
    queryKey: ['ecole', 'coefficients', targetId ?? 'none'],
    enabled: !!targetId,
    queryFn: async () => {
      if (!targetId) return {}
      const snap = await getDoc(docRef(ecoleCoefficientsDoc(targetId)))
      return snap.exists() ? (snap.data() as CoefficientsDoc) : {}
    },
    staleTime: TEN_MIN,
  })
}

export interface UpdateCoefficientsInput {
  niveau: Niveau
  serie: Serie | null
  /** Full replacement set — caller should merge before calling */
  coefficients: CoefficientsDoc
}

export function useUpdateCoefficients() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ niveau, serie, coefficients }: UpdateCoefficientsInput) => {
      // Strip zeros and non-positive values — they shouldn't pollute the doc
      const cleaned: CoefficientsDoc = {}
      for (const [m, c] of Object.entries(coefficients)) {
        if (typeof c === 'number' && c > 0) cleaned[m] = c
      }
      await setDoc(
        docRef(ecoleCoefficientsDoc(coefficientsTargetId(niveau, serie))),
        cleaned
      )
    },
    onSuccess: (_d, vars) => {
      const tid = coefficientsTargetId(vars.niveau, vars.serie)
      qc.invalidateQueries({ queryKey: ['ecole', 'coefficients', tid] })
    },
  })
}
