/**
 * RT-SC · Séances — write hooks.
 *
 * Create / update / delete, all gated by admin role at the rules layer
 * (client-side check is UX only). Conflict detection is a PRE-SAVE helper
 * exposed separately; callers should run it first and display conflicts
 * to the admin, then either save with force=true (admin overrides) or
 * abort.
 *
 * We don't auto-abort on conflict because an admin legitimately might
 * need to overlap séances during input (typing mid-entry, fixing mistakes,
 * intentional double sessions). The admin decides.
 */

import { useMutation } from '@tanstack/react-query'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { db } from '@/firebase'
import { seancesCol, seanceDoc } from '@/lib/firestore-keys'
import { useAuthStore } from '@/stores/auth'
import type { Jour } from '@/types/models'

export interface CreateSeanceInput {
  classeId: string
  profId: string
  matiere: string
  matiereId?: string
  jour: Jour
  heureDebut: string
  heureFin: string
  salle?: string | null
  anneeScolaireId?: string
}

export interface UpdateSeanceInput extends CreateSeanceInput {
  id: string
}

export function useCreateSeance() {
  const user = useAuthStore((s) => s.user)

  return useMutation({
    mutationFn: async (input: CreateSeanceInput) => {
      const payload: Record<string, unknown> = {
        classeId: input.classeId,
        profId: input.profId,
        matiere: input.matiere.trim(),
        jour: input.jour,
        heureDebut: input.heureDebut,
        heureFin: input.heureFin,
        createdAt: serverTimestamp(),
        createdBy: user?.uid ?? null,
      }
      if (input.matiereId) payload.matiereId = input.matiereId
      if (input.salle) payload.salle = input.salle
      if (input.anneeScolaireId) payload.anneeScolaireId = input.anneeScolaireId
      const ref = await addDoc(collection(db, seancesCol()), payload)
      return ref.id
    },
    // No onSuccess — onSnapshot in useAllSeances pushes the new doc into
    // the cache within milliseconds of the server commit. Invalidating
    // here would race and overwrite the snapshot with an empty result
    // from getQueryData before the snapshot arrives.
  })
}

export function useUpdateSeance() {
  return useMutation({
    mutationFn: async (input: UpdateSeanceInput) => {
      const { id, ...rest } = input
      const payload: Record<string, unknown> = {
        classeId: rest.classeId,
        profId: rest.profId,
        matiere: rest.matiere.trim(),
        jour: rest.jour,
        heureDebut: rest.heureDebut,
        heureFin: rest.heureFin,
        updatedAt: serverTimestamp(),
      }
      if (rest.matiereId) payload.matiereId = rest.matiereId
      else payload.matiereId = null
      payload.salle = rest.salle ?? null
      if (rest.anneeScolaireId) payload.anneeScolaireId = rest.anneeScolaireId
      await updateDoc(doc(db, seanceDoc(id)), payload)
    },
  })
}

export function useDeleteSeance() {
  return useMutation({
    mutationFn: async (id: string) => {
      await deleteDoc(doc(db, seanceDoc(id)))
    },
  })
}
