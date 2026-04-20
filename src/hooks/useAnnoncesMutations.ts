/**
 * RT-SC · Annonces mutations — create / update / delete.
 *
 * Admin-only writes. Optimistic update patterns kept simple — the
 * onSnapshot in useAllAnnonces reconciles anyway within ~200ms.
 */

import { useMutation } from '@tanstack/react-query'
import {
  addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc,
  type Timestamp,
} from 'firebase/firestore'
import { db } from '@/firebase'
import { annoncesCol, annonceDoc } from '@/lib/firestore-keys'
import { useAuthStore } from '@/stores/auth'
import type { AnnoncePriority, AnnonceScope } from '@/types/models'

export interface CreateAnnonceInput {
  title: string
  body: string
  scope: AnnonceScope
  priority: AnnoncePriority
  expiresAt?: Timestamp | null
}

export function useCreateAnnonce() {
  const user = useAuthStore((s) => s.user)
  const profil = useAuthStore((s) => s.profil)

  return useMutation({
    mutationFn: async (input: CreateAnnonceInput) => {
      if (!user?.uid) throw new Error('Not authenticated')
      const payload: Record<string, unknown> = {
        title: input.title.trim(),
        body: input.body.trim(),
        scope: input.scope,
        priority: input.priority,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
        createdByName: profil?.nom ?? null,
      }
      if (input.expiresAt) payload.expiresAt = input.expiresAt
      const ref = await addDoc(collection(db, annoncesCol()), payload)
      return ref.id
    },
  })
}

export interface UpdateAnnonceInput extends CreateAnnonceInput {
  id: string
}

export function useUpdateAnnonce() {
  return useMutation({
    mutationFn: async (input: UpdateAnnonceInput) => {
      const { id, ...rest } = input
      const payload: Record<string, unknown> = {
        title: rest.title.trim(),
        body: rest.body.trim(),
        scope: rest.scope,
        priority: rest.priority,
        updatedAt: serverTimestamp(),
      }
      if (rest.expiresAt) payload.expiresAt = rest.expiresAt
      else payload.expiresAt = null
      await updateDoc(doc(db, annonceDoc(id)), payload)
    },
  })
}

export function useDeleteAnnonce() {
  return useMutation({
    mutationFn: async (id: string) => {
      await deleteDoc(doc(db, annonceDoc(id)))
    },
  })
}
