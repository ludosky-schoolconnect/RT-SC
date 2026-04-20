/**
 * RT-SC · Classes — write hooks (mutations).
 *
 * Optimistic updates by default: UI flips instantly, rolls back if the
 * server rejects. Each mutation invalidates the affected queries on settle.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  updateDoc,
  deleteDoc,
  addDoc,
  collection,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore'
import { db, docRef, colRef } from '@/firebase'
import {
  classeDoc,
  classesCol,
  elevesCol,
  bulletinsCol,
  paiementsCol,
  absencesCol,
  notesCol,
  collesCol,
} from '@/lib/firestore-keys'
import { genererClassePasskey } from '@/lib/benin'
import type { Classe, Cycle, Niveau, Serie } from '@/types/models'

// ─── Create ─────────────────────────────────────────────────

export interface CreateClasseInput {
  cycle: Cycle
  niveau: Niveau
  serie: Serie | null
  salle: string
  annee: string
}

export function useCreateClasse() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateClasseInput): Promise<Classe> => {
      const passkey = genererClassePasskey()
      const newRef = await addDoc(colRef(classesCol()), {
        cycle: input.cycle,
        niveau: input.niveau,
        serie: input.serie,
        salle: input.salle.trim(),
        passkey,
        annee: input.annee,
        professeursIds: [],
        profPrincipalId: '',
        createdAt: serverTimestamp(),
      })
      return {
        id: newRef.id,
        cycle: input.cycle,
        niveau: input.niveau,
        serie: input.serie,
        salle: input.salle.trim(),
        passkey,
        annee: input.annee,
        professeursIds: [],
        profPrincipalId: '',
        // Server timestamp resolves on next read; placeholder fine here
        createdAt: { toDate: () => new Date() } as never,
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['classes'] })
    },
  })
}

// ─── Update ─────────────────────────────────────────────────

export interface UpdateClasseInput {
  id: string
  patch: Partial<Pick<Classe, 'niveau' | 'serie' | 'salle' | 'profPrincipalId' | 'cycle'>>
}

export function useUpdateClasse() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, patch }: UpdateClasseInput) => {
      await updateDoc(docRef(classeDoc(id)), patch)
    },
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: ['classes'] })
      const previous = qc.getQueryData<Classe[]>(['classes'])
      qc.setQueryData<Classe[]>(['classes'], (old) =>
        (old ?? []).map((c) => (c.id === id ? { ...c, ...patch } : c))
      )
      qc.setQueryData<Classe | null>(['classe', id], (old) =>
        old ? { ...old, ...patch } : old
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(['classes'], ctx.previous)
    },
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: ['classes'] })
      qc.invalidateQueries({ queryKey: ['classe', vars.id] })
    },
  })
}

// ─── Regenerate passkey ─────────────────────────────────────

export function useRegeneratePasskey() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string): Promise<string> => {
      const newPasskey = genererClassePasskey()
      await updateDoc(docRef(classeDoc(id)), { passkey: newPasskey })
      return newPasskey
    },
    onSuccess: (newPasskey, id) => {
      qc.setQueryData<Classe[]>(['classes'], (old) =>
        (old ?? []).map((c) => (c.id === id ? { ...c, passkey: newPasskey } : c))
      )
      qc.setQueryData<Classe | null>(['classe', id], (old) =>
        old ? { ...old, passkey: newPasskey } : old
      )
    },
  })
}

// ─── Delete (cascading subcollection cleanup) ───────────────

export function useDeleteClasse() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      // Wipe per-élève subcollections, then the élève, then the class doc.
      // Sequential rather than parallel to keep things simple and avoid
      // overwhelming Firestore on bigger classes.
      const elevesSnap = await getDocs(collection(db, elevesCol(id)))

      for (const eDoc of elevesSnap.docs) {
        const eId = eDoc.id
        const subPaths = [
          notesCol(id, eId),
          collesCol(id, eId),
          absencesCol(id, eId),
          bulletinsCol(id, eId),
          paiementsCol(id, eId),
        ]
        for (const path of subPaths) {
          const subSnap = await getDocs(collection(db, path))
          await Promise.all(subSnap.docs.map((d) => deleteDoc(d.ref)))
        }
        await deleteDoc(eDoc.ref)
      }

      await deleteDoc(docRef(classeDoc(id)))
    },
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: ['classes'] })
      const previous = qc.getQueryData<Classe[]>(['classes'])
      qc.setQueryData<Classe[]>(['classes'], (old) =>
        (old ?? []).filter((c) => c.id !== id)
      )
      return { previous }
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(['classes'], ctx.previous)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['classes'] })
    },
  })
}
