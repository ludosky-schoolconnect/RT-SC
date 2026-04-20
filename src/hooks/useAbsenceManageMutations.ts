/**
 * RT-SC · Absences — admin write hooks (approve / refuse / delete).
 *
 * These touch the SELF-DECLARED collection only:
 *   /classes/{classeId}/eleves/{eleveId}/absences/{absenceId}
 *
 * Prof-marked absences (from /presences) are not edited here — those
 * are amended by re-taking the appel (see 5d.1 re-take semantics).
 *
 * Permissions: Firestore rules enforce `allow update, delete: if isStaff()`.
 * The UI gates the buttons on a `canManage` prop so non-admin staff don't
 * see them. Strictly we could allow any prof to approve, but the school's
 * policy is admin-only — easier to enforce in UI than tighten rules later.
 */

import { useMutation } from '@tanstack/react-query'
import { deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '@/firebase'
import { absenceDoc } from '@/lib/firestore-keys'
import type { StatutAbsence } from '@/types/models'

export interface UpdateAbsenceStatutInput {
  classeId: string
  eleveId: string
  absenceId: string
  statut: Exclude<StatutAbsence, 'en attente'> // only validée/refusée
}

export function useUpdateAbsenceStatut() {
  return useMutation({
    mutationFn: async (input: UpdateAbsenceStatutInput) => {
      await updateDoc(
        doc(db, absenceDoc(input.classeId, input.eleveId, input.absenceId)),
        {
          statut: input.statut,
          statutUpdatedAt: serverTimestamp(),
        }
      )
    },
  })
}

export interface DeleteAbsenceInput {
  classeId: string
  eleveId: string
  absenceId: string
}

export function useDeleteAbsence() {
  return useMutation({
    mutationFn: async (input: DeleteAbsenceInput) => {
      await deleteDoc(
        doc(db, absenceDoc(input.classeId, input.eleveId, input.absenceId))
      )
    },
  })
}
