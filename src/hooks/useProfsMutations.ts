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
import { genererPasskeyProf } from '@/lib/benin'
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

      // Also remove as profPrincipal if any class had them set
      // (we'd need to query — skip for now, daily-ops modules will catch it)

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
  })
}
