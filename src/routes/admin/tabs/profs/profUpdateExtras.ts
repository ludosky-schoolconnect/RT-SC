/**
 * RT-SC · Small prof-detail mutations.
 *
 * Lives next to the modal that uses them (matières edit). Re-exports the
 * delete mutation from the central hook for ergonomic imports inside the
 * profs/ subtree.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateDoc } from 'firebase/firestore'
import { docRef } from '@/firebase'
import { professeurDoc } from '@/lib/firestore-keys'
import type { Professeur } from '@/types/models'

export { useDeleteProf } from '@/hooks/useProfsMutations'

export interface UpdateProfMatieresInput {
  profId: string
  matieres: string[]
}

export function useUpdateProfMatieres() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ profId, matieres }: UpdateProfMatieresInput) => {
      await updateDoc(docRef(professeurDoc(profId)), { matieres })
    },
    onMutate: async ({ profId, matieres }) => {
      await qc.cancelQueries({ queryKey: ['profs'] })
      const previous = qc.getQueryData<Professeur[]>(['profs'])
      qc.setQueryData<Professeur[]>(['profs'], (old) =>
        (old ?? []).map((p) => (p.id === profId ? { ...p, matieres } : p))
      )
      return { previous }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(['profs'], ctx.previous)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['profs'] })
    },
  })
}
