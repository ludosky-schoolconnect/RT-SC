/**
 * RT-SC · Professeurs — write hooks.
 *
 * Includes the bidirectional class assignment that the legacy app
 * had to wire by hand: when admin assigns prof to classes, the
 * mutation also updates each affected class's professeursIds array.
 *
 * Critical behaviors preserved from legacy:
 *   - Approve = set statut: 'actif'
 *   - Reject  = delete the professeurs/{uid} doc
 *     (the Firebase Auth account remains; rejected users could re-signup
 *     with the same email if they know the passkeyProf — same as legacy)
 *   - Assign classes = update prof.classesIds AND each class.professeursIds
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  deleteDoc,
  getDoc,
  setDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore'
import { docRef } from '@/firebase'
import {
  ecoleSecuriteDoc,
  classeDoc,
  professeurDoc,
} from '@/lib/firestore-keys'
import { genererPasskeyCaisse, genererPasskeyProf } from '@/lib/benin'
import type { Professeur, Classe } from '@/types/models'

// ─── Approve ────────────────────────────────────────────────

export function useApproveProf() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (profId: string) => {
      await setDoc(
        docRef(professeurDoc(profId)),
        { statut: 'actif' },
        { merge: true }
      )
    },
    onMutate: async (profId) => {
      await qc.cancelQueries({ queryKey: ['profs'] })
      const previous = qc.getQueryData<Professeur[]>(['profs'])
      qc.setQueryData<Professeur[]>(['profs'], (old) =>
        (old ?? []).map((p) => (p.id === profId ? { ...p, statut: 'actif' } : p))
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

// ─── Reject (= delete pending request) ──────────────────────

export function useRejectProf() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (profId: string) => {
      await deleteDoc(docRef(professeurDoc(profId)))
    },
    onMutate: async (profId) => {
      await qc.cancelQueries({ queryKey: ['profs'] })
      const previous = qc.getQueryData<Professeur[]>(['profs'])
      qc.setQueryData<Professeur[]>(['profs'], (old) =>
        (old ?? []).filter((p) => p.id !== profId)
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

// ─── Delete active prof ─────────────────────────────────────

export function useDeleteProf() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (profId: string) => {
      // Read the prof to know which classes to clean up
      const profSnap = await getDoc(docRef(professeurDoc(profId)))
      const classesIds: string[] = profSnap.exists()
        ? ((profSnap.data() as Professeur).classesIds ?? [])
        : []

      // Remove this prof from each class's professeursIds
      for (const cid of classesIds) {
        try {
          await updateDoc(docRef(classeDoc(cid)), {
            professeursIds: arrayRemove(profId),
          })
        } catch {
          // continue cleanup even if one fails
        }
      }

      // Cascade-delete any seances (emploi du temps entries) referencing
      // this prof. Without this cleanup, the schedule grid keeps showing
      // ghost slots that nobody can teach.
      //
      // We also clear profPrincipalId on any class that had this prof as
      // PP. Without this, the class carries a stale PP reference that
      // blocks/confuses the class-detail view.
      try {
        const { collectionGroup, query: fsQuery, where, getDocs } =
          await import('firebase/firestore')
        const { db } = await import('@/firebase')
        const seancesSnap = await getDocs(
          fsQuery(
            collectionGroup(db, 'seances'),
            where('profId', '==', profId)
          )
        )
        for (const sd of seancesSnap.docs) {
          // Only delete seances under /emploisDuTemps/{cid}/seances.
          // The root /seances collection (legacy) is matched by
          // collectionGroup too but shouldn't be touched.
          if (sd.ref.path.startsWith('emploisDuTemps/')) {
            await deleteDoc(sd.ref)
          }
        }
      } catch (e) {
        console.warn(
          '[useDeleteProf] seances cleanup failed:',
          (e as Error).message
        )
      }

      // Clear profPrincipalId from any class where this prof was PP
      try {
        const { collection, getDocs, query: fsQuery, where } = await import(
          'firebase/firestore'
        )
        const { db } = await import('@/firebase')
        const { classesCol } = await import('@/lib/firestore-keys')
        const ppSnap = await getDocs(
          fsQuery(
            collection(db, classesCol()),
            where('profPrincipalId', '==', profId)
          )
        )
        for (const cd of ppSnap.docs) {
          try {
            await updateDoc(cd.ref, { profPrincipalId: '' })
          } catch {
            // skip per-class failures
          }
        }
      } catch (e) {
        console.warn(
          '[useDeleteProf] profPrincipal cleanup failed:',
          (e as Error).message
        )
      }

      await deleteDoc(docRef(professeurDoc(profId)))
    },
    onMutate: async (profId) => {
      await qc.cancelQueries({ queryKey: ['profs'] })
      const previous = qc.getQueryData<Professeur[]>(['profs'])
      qc.setQueryData<Professeur[]>(['profs'], (old) =>
        (old ?? []).filter((p) => p.id !== profId)
      )
      return { previous }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(['profs'], ctx.previous)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['profs'] })
      qc.invalidateQueries({ queryKey: ['classes'] })
      // Emploi du temps needs to reflect removed seances
      qc.invalidateQueries({ queryKey: ['seances'] })
    },
  })
}

// ─── Assign classes (bidirectional sync) ────────────────────

export interface AssignClassesInput {
  profId: string
  /** Final state — what classes the prof should be in after this call */
  selectedClasseIds: string[]
}

export function useAssignClasses() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ profId, selectedClasseIds }: AssignClassesInput) => {
      // 1. Read current state from cache (or Firestore as fallback)
      const profs = qc.getQueryData<Professeur[]>(['profs']) ?? []
      const prof = profs.find((p) => p.id === profId)
      const previousIds: string[] = prof?.classesIds ?? []

      const toAdd = selectedClasseIds.filter((id) => !previousIds.includes(id))
      const toRemove = previousIds.filter((id) => !selectedClasseIds.includes(id))

      // 2. Update the prof's classesIds (single write)
      await updateDoc(docRef(professeurDoc(profId)), {
        classesIds: selectedClasseIds,
      })

      // 3. Bidirectional sync: update each affected class's professeursIds
      for (const cid of toAdd) {
        try {
          await updateDoc(docRef(classeDoc(cid)), {
            professeursIds: arrayUnion(profId),
          })
        } catch {
          // continue — best-effort sync
        }
      }
      for (const cid of toRemove) {
        try {
          await updateDoc(docRef(classeDoc(cid)), {
            professeursIds: arrayRemove(profId),
          })
        } catch {
          // continue
        }
      }
    },
    onMutate: async ({ profId, selectedClasseIds }) => {
      await qc.cancelQueries({ queryKey: ['profs'] })
      const previous = qc.getQueryData<Professeur[]>(['profs'])
      qc.setQueryData<Professeur[]>(['profs'], (old) =>
        (old ?? []).map((p) =>
          p.id === profId ? { ...p, classesIds: selectedClasseIds } : p
        )
      )
      return { previous }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(['profs'], ctx.previous)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['profs'] })
      qc.invalidateQueries({ queryKey: ['classes'] })
    },
  })
}

// ─── Set "Professeur Principal" of a class ─────────────────

export interface SetProfPrincipalInput {
  classeId: string
  profId: string  // empty string clears it
}

export function useSetProfPrincipal() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ classeId, profId }: SetProfPrincipalInput) => {
      await updateDoc(docRef(classeDoc(classeId)), {
        profPrincipalId: profId,
      })
    },
    onMutate: async ({ classeId, profId }) => {
      await qc.cancelQueries({ queryKey: ['classes'] })
      const previous = qc.getQueryData<Classe[]>(['classes'])
      qc.setQueryData<Classe[]>(['classes'], (old) =>
        (old ?? []).map((c) =>
          c.id === classeId ? { ...c, profPrincipalId: profId } : c
        )
      )
      return { previous }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(['classes'], ctx.previous)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['classes'] })
    },
  })
}

// ─── Regenerate prof passkey (the school-wide signup code) ──

export function useRegeneratePasskeyProf() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<string> => {
      const newKey = genererPasskeyProf()
      await setDoc(
        docRef(ecoleSecuriteDoc()),
        { passkeyProf: newKey },
        { merge: true }
      )
      return newKey
    },
    onSuccess: () => {
      // Refetch so the PasskeyProfPanel displays the new code without
      // requiring a page refresh (it reads from useEcoleSecurite).
      qc.invalidateQueries({ queryKey: ['ecole', 'securite'] })
    },
  })
}

// ─── Regenerate caisse passkey (separate from prof) ─────────

export function useRegeneratePasskeyCaisse() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<string> => {
      const newKey = genererPasskeyCaisse()
      await setDoc(
        docRef(ecoleSecuriteDoc()),
        { passkeyCaisse: newKey },
        { merge: true }
      )
      return newKey
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ecole', 'securite'] })
    },
  })
}

// ─── Update role ────────────────────────────────────────────
//
// Changes a prof's role between admin / prof / caissier.
//
// Side effect: when switching TO 'caissier', classesIds + matieres
// are cleared. The caissier role doesn't teach, so these fields
// would be stale/misleading if left populated. If the admin later
// demotes them back to 'prof', they'll need to re-assign.
//
// The reverse (caissier → prof) leaves arrays empty and admin
// re-assigns classes manually. Same ceremony as onboarding a new
// prof.
//
// This mutation also updates classes' professeursIds to remove the
// prof from any classes they were in when going TO caissier — same
// logic the "remove prof" / delete flow uses to avoid orphaned
// class-side references.

export interface UpdateProfRoleInput {
  profId: string
  role: 'admin' | 'prof' | 'caissier'
}

export function useUpdateProfRole() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ profId, role }: UpdateProfRoleInput) => {
      // Read the current prof doc to know which classes to clean up
      // if we're switching to caissier.
      const profSnap = await getDoc(docRef(professeurDoc(profId)))
      if (!profSnap.exists()) throw new Error('Professeur introuvable.')
      const prof = profSnap.data() as Omit<Professeur, 'id'>
      const previousClasses = prof.classesIds ?? []

      if (role === 'caissier') {
        // 1. Clear caissier's teaching fields
        await updateDoc(docRef(professeurDoc(profId)), {
          role,
          classesIds: [],
          matieres: [],
        })

        // 2. Remove prof from each class's professeursIds. Missing
        //    classes are tolerated — they were deleted separately.
        for (const classeId of previousClasses) {
          try {
            await updateDoc(docRef(classeDoc(classeId)), {
              professeursIds: arrayRemove(profId),
            })
          } catch (e) {
            console.warn(
              `[useUpdateProfRole] class ${classeId} cleanup skipped:`,
              (e as Error).message
            )
          }
        }
      } else {
        // Switching to admin or plain prof — just flip the role field.
        // Classes and matieres stay put (admin keeps their assignments
        // if they had any; prof keeps theirs).
        await updateDoc(docRef(professeurDoc(profId)), { role })
      }
    },
    // NOTE: no onMutate (no optimistic update). Two writers were
    // racing for the ['profs'] cache:
    //   - the optimistic setter (onMutate)
    //   - the useProfs onSnapshot listener
    // onSnapshot would sometimes fire between onMutate's write and
    // the server confirming, overwriting the optimistic value with
    // the pre-mutation state. Net effect: the role picker in the
    // modal would flip back to the old role for a moment, or stay
    // stale until the modal was reopened.
    //
    // mutationFn already awaits updateDoc, so by the time the
    // promise resolves the Firestore write is committed and the
    // very next onSnapshot fire carries the new role. No
    // optimistic update needed — the listener is fast enough.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['profs'] })
      qc.invalidateQueries({ queryKey: ['classes'] })
    },
  })
}
