/**
 * RT-SC · Élèves — write hooks.
 *
 * All mutations operate on a single class's subcollection.
 * Create + delete invalidate the live snapshot; the snapshot then
 * reflects the change naturally. Update is optimistic.
 *
 * Codes (PIN, parent passkey) are auto-generated using the helpers
 * from lib/benin.ts.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  addDoc,
  collection,
  deleteDoc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { db, docRef } from '@/firebase'
import {
  absencesCol,
  bulletinsCol,
  collesCol,
  eleveDoc,
  elevesCol,
  notesCol,
  paiementsCol,
  presencesCol,
} from '@/lib/firestore-keys'
import { genererCodePin, genererPasskeyParent } from '@/lib/benin'
import type { Eleve, Genre } from '@/types/models'

// ─── Create ─────────────────────────────────────────────────

export interface CreateEleveInput {
  classeId: string
  nom: string
  genre: Genre
  dateNaissance: string  // YYYY-MM-DD
  contactParent?: string
  ajoutePar?: string  // uid of admin who added
}

export function useCreateEleve() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateEleveInput): Promise<{ id: string; codePin: string; passkeyParent: string }> => {
      const codePin = genererCodePin()
      const passkeyParent = genererPasskeyParent()

      const newRef = await addDoc(
        collection(db, elevesCol(input.classeId)),
        {
          nom: input.nom.trim(),
          genre: input.genre,
          contactParent: (input.contactParent ?? '').trim(),
          date_naissance: input.dateNaissance.trim(),
          dateAjout: serverTimestamp(),
          ajoutePar: input.ajoutePar ?? '',
          codePin,
          passkeyParent,
        }
      )
      return { id: newRef.id, codePin, passkeyParent }
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['eleves', vars.classeId] })
      qc.invalidateQueries({ queryKey: ['classe', vars.classeId, 'eleve-count'] })
      qc.invalidateQueries({ queryKey: ['school-stats'] })
    },
  })
}

// ─── Update ─────────────────────────────────────────────────

export interface UpdateEleveInput {
  classeId: string
  eleveId: string
  patch: Partial<Pick<Eleve, 'nom' | 'genre' | 'contactParent' | 'date_naissance'>>
}

export function useUpdateEleve() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ classeId, eleveId, patch }: UpdateEleveInput) => {
      // Trim string fields before write
      const cleaned: Record<string, unknown> = { ...patch }
      if (typeof cleaned.nom === 'string') cleaned.nom = (cleaned.nom as string).trim()
      if (typeof cleaned.contactParent === 'string')
        cleaned.contactParent = (cleaned.contactParent as string).trim()
      await updateDoc(docRef(eleveDoc(classeId, eleveId)), cleaned)
    },
    onMutate: async ({ classeId, eleveId, patch }) => {
      await qc.cancelQueries({ queryKey: ['eleves', classeId] })
      const previous = qc.getQueryData<Eleve[]>(['eleves', classeId])
      qc.setQueryData<Eleve[]>(['eleves', classeId], (old) =>
        (old ?? []).map((e) => (e.id === eleveId ? { ...e, ...patch } : e))
      )
      return { previous }
    },
    onError: (_err, vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(['eleves', vars.classeId], ctx.previous)
    },
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: ['eleves', vars.classeId] })
    },
  })
}

// ─── Regenerate PIN ─────────────────────────────────────────

export function useRegenerateEleveCodes() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (args: {
      classeId: string
      eleveId: string
      what: 'pin' | 'parent' | 'both'
    }): Promise<{ codePin?: string; passkeyParent?: string }> => {
      const patch: Record<string, string> = {}
      if (args.what === 'pin' || args.what === 'both') {
        patch.codePin = genererCodePin()
      }
      if (args.what === 'parent' || args.what === 'both') {
        patch.passkeyParent = genererPasskeyParent()
      }
      await updateDoc(docRef(eleveDoc(args.classeId, args.eleveId)), patch)
      return {
        codePin: patch.codePin,
        passkeyParent: patch.passkeyParent,
      }
    },
    onSuccess: (returned, vars) => {
      qc.setQueryData<Eleve[]>(['eleves', vars.classeId], (old) =>
        (old ?? []).map((e) =>
          e.id === vars.eleveId
            ? {
                ...e,
                ...(returned.codePin ? { codePin: returned.codePin } : {}),
                ...(returned.passkeyParent
                  ? { passkeyParent: returned.passkeyParent }
                  : {}),
              }
            : e
        )
      )
    },
  })
}

// ─── Delete (cascading subcollection cleanup) ───────────────

export function useDeleteEleve() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (args: { classeId: string; eleveId: string }) => {
      const { classeId, eleveId } = args
      const subPaths = [
        notesCol(classeId, eleveId),
        collesCol(classeId, eleveId),
        absencesCol(classeId, eleveId),
        bulletinsCol(classeId, eleveId),
        paiementsCol(classeId, eleveId),
      ]
      for (const path of subPaths) {
        const subSnap = await getDocs(collection(db, path))
        await Promise.all(subSnap.docs.map((d) => deleteDoc(d.ref)))
      }
      // Best-effort: also clean up presence references that mention this élève.
      // Skipping in this phase since it's a read-and-write loop across all
      // presence docs. Will be handled in Phase 5 (Daily ops) when we touch
      // presence subscriptions anyway.
      void presencesCol  // referenced for eslint awareness

      await deleteDoc(docRef(eleveDoc(classeId, eleveId)))
    },
    onMutate: async ({ classeId, eleveId }) => {
      await qc.cancelQueries({ queryKey: ['eleves', classeId] })
      const previous = qc.getQueryData<Eleve[]>(['eleves', classeId])
      qc.setQueryData<Eleve[]>(['eleves', classeId], (old) =>
        (old ?? []).filter((e) => e.id !== eleveId)
      )
      return { previous }
    },
    onError: (_err, vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(['eleves', vars.classeId], ctx.previous)
    },
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: ['eleves', vars.classeId] })
      qc.invalidateQueries({ queryKey: ['classe', vars.classeId, 'eleve-count'] })
      qc.invalidateQueries({ queryKey: ['school-stats'] })
    },
  })
}
