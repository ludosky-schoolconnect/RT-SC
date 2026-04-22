/**
 * RT-SC · Absences — admin write hooks (approve / refuse / delete).
 *
 * Two collections handled:
 *
 *   1. SELF-DECLARED — /classes/{}/eleves/{}/absences/{absenceId}
 *      Approve / refuse / hard-delete via the Statut + DeleteAbsence hooks.
 *
 *   2. PROF-MARKED — /classes/{}/presences/{date}.{matiere}.absents.{eleveId}
 *      Hard-delete only (admin error correction without forcing prof to
 *      re-take the whole appel). Uses FieldValue.delete() on the nested
 *      key so other slots stay intact.
 *
 * Permissions: Firestore rules enforce `allow update, delete: if isStaff()`.
 * The UI gates the buttons on a `canManage` prop so non-admin staff don't
 * see them.
 */

import { useMutation } from '@tanstack/react-query'
import {
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { db } from '@/firebase'
import { absenceDoc, archivedAbsenceDoc, presenceDoc } from '@/lib/firestore-keys'
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
      const ref = doc(
        db,
        absenceDoc(input.classeId, input.eleveId, input.absenceId)
      )

      async function attemptDelete(): Promise<void> {
        // Pre-check existence — Firestore deleteDoc silently no-ops on
        // a missing doc, so without this we'd toast "supprimé" while
        // the actual document sits at a different path entirely.
        const before = await getDoc(ref)
        if (!before.exists()) {
          throw new Error(
            `Document introuvable au chemin attendu (${input.classeId}/${input.eleveId}/${input.absenceId}). Données legacy potentiellement à un autre emplacement.`
          )
        }

        await deleteDoc(ref)

        // Post-verify — confirm the doc is actually gone.
        const after = await getDoc(ref)
        if (after.exists()) {
          throw new Error(
            'Suppression silencieusement refusée par Firestore (règles de sécurité ?).'
          )
        }
      }

      try {
        await attemptDelete()
      } catch (err) {
        // SDK INTERNAL ASSERTION = persistent cache layer race condition,
        // typically when the auto-cleanup background job in
        // useSchoolAbsences touches the same doc. Wait briefly for the
        // cache to settle, then retry once.
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('INTERNAL ASSERTION FAILED')) {
          console.warn(
            '[useDeleteAbsence] SDK assertion fired; retrying after cache settle…'
          )
          await new Promise((r) => setTimeout(r, 800))
          try {
            await attemptDelete()
          } catch (retryErr) {
            const retryMsg =
              retryErr instanceof Error ? retryErr.message : String(retryErr)
            // If the retry also assertion-fails, the cache is in a worse
            // state. Tell the user to reload the page (clears IndexedDB
            // cache and gives the SDK a fresh slate).
            if (retryMsg.includes('INTERNAL ASSERTION FAILED')) {
              throw new Error(
                'Cache local Firestore corrompu. Rechargez la page (Ctrl+Shift+R) et réessayez.'
              )
            }
            throw retryErr
          }
        } else {
          throw err
        }
      }
    },
  })
}

export interface DeleteMarkedAbsenceInput {
  classeId: string
  dateISO: string
  matiereSlug: string
  eleveId: string
}

/**
 * Removes a single élève from a presence slot's `absents` map without
 * touching the rest of the slot. Uses Firestore's `FieldValue.delete()`
 * on the nested path `{matiereSlug}.absents.{eleveId}`.
 *
 * Use case: prof made a mistake during appel and didn't notice. Admin
 * surgically removes that one absence rather than forcing a re-take.
 */
export function useDeleteMarkedAbsence() {
  return useMutation({
    mutationFn: async (input: DeleteMarkedAbsenceInput) => {
      const ref = doc(db, presenceDoc(input.classeId, input.dateISO))
      await updateDoc(ref, {
        [`${input.matiereSlug}.absents.${input.eleveId}`]: deleteField(),
      })
    },
  })
}

// ─── Archive deletion ─────────────────────────────────────────

export function useDeleteArchivedAbsence() {
  return useMutation({
    mutationFn: async (archiveId: string) => {
      await deleteDoc(doc(db, archivedAbsenceDoc(archiveId)))
    },
  })
}

/**
 * Bulk-delete every archive doc whose id is in the given list. Used
 * by the "Supprimer la sélection" action. Fires one write per id but
 * Firestore batches aren't required at this volume (admin unlikely to
 * select thousands at once).
 */
export function useDeleteArchivedAbsencesBulk() {
  return useMutation({
    mutationFn: async (archiveIds: string[]) => {
      await Promise.all(
        archiveIds.map((id) =>
          deleteDoc(doc(db, archivedAbsenceDoc(id)))
        )
      )
    },
  })
}

