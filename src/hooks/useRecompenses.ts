/**
 * RT-SC · Recompenses (rewards catalog) hooks.
 *
 * Manages the school-wide rewards catalog at /recompenses.
 *
 * Reads: live via onSnapshot piped into React Query cache. Catalogs
 * are usually small (5-30 entries), so listing the whole collection
 * is fine.
 *
 * Writes: optimistic for fast UX. Add returns the new ID, update
 * patches in place, delete filters out then invalidates.
 */

import { useEffect } from 'react'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { db } from '@/firebase'
import { recompensesCol, recompenseDoc } from '@/lib/firestore-keys'
import type { Recompense } from '@/types/models'

const FIVE_MIN = 5 * 60_000

// ─── Read ─────────────────────────────────────────────────────

export function useRecompenses() {
  const qc = useQueryClient()
  const key = ['recompenses']

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, recompensesCol()), orderBy('pointsRequis', 'asc')),
      (snap) => {
        const list: Recompense[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Recompense, 'id'>),
        }))
        qc.setQueryData(key, list)
      },
      (err) => console.error('[useRecompenses] snapshot error:', err)
    )
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return useQuery<Recompense[]>({
    queryKey: key,
    queryFn: async () => qc.getQueryData<Recompense[]>(key) ?? [],
    staleTime: FIVE_MIN,
  })
}

// ─── Write ────────────────────────────────────────────────────

export interface AddRecompenseInput {
  nom: string
  description?: string
  pointsRequis: number
  disponible: boolean
  createdBy: string
}

export function useAddRecompense() {
  return useMutation({
    mutationFn: async (input: AddRecompenseInput): Promise<{ id: string }> => {
      const ref = await addDoc(collection(db, recompensesCol()), {
        nom: input.nom.trim(),
        ...(input.description?.trim()
          ? { description: input.description.trim() }
          : {}),
        pointsRequis: Math.max(0, Math.round(input.pointsRequis)),
        disponible: input.disponible,
        createdAt: serverTimestamp(),
        createdBy: input.createdBy,
      })
      return { id: ref.id }
    },
  })
}

export interface UpdateRecompenseInput {
  id: string
  nom?: string
  description?: string
  pointsRequis?: number
  disponible?: boolean
}

export function useUpdateRecompense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpdateRecompenseInput): Promise<void> => {
      const patch: Record<string, unknown> = { updatedAt: serverTimestamp() }
      if (input.nom !== undefined) patch.nom = input.nom.trim()
      if (input.description !== undefined) {
        const trimmed = input.description.trim()
        // Use empty string sentinel to clear; or omit if empty
        if (trimmed) patch.description = trimmed
        else patch.description = ''
      }
      if (input.pointsRequis !== undefined) {
        patch.pointsRequis = Math.max(0, Math.round(input.pointsRequis))
      }
      if (input.disponible !== undefined) patch.disponible = input.disponible

      await updateDoc(doc(db, recompenseDoc(input.id)), patch)
    },
    onMutate: async (input) => {
      // Optimistic update
      await qc.cancelQueries({ queryKey: ['recompenses'] })
      const previous = qc.getQueryData<Recompense[]>(['recompenses'])
      qc.setQueryData<Recompense[]>(['recompenses'], (old) => {
        if (!old) return old
        return old.map((r) => {
          if (r.id !== input.id) return r
          return {
            ...r,
            ...(input.nom !== undefined ? { nom: input.nom.trim() } : {}),
            ...(input.description !== undefined
              ? { description: input.description.trim() }
              : {}),
            ...(input.pointsRequis !== undefined
              ? { pointsRequis: Math.max(0, Math.round(input.pointsRequis)) }
              : {}),
            ...(input.disponible !== undefined
              ? { disponible: input.disponible }
              : {}),
          }
        })
      })
      return { previous }
    },
    onError: (_err, _input, context) => {
      if (context?.previous) qc.setQueryData(['recompenses'], context.previous)
    },
  })
}

export function useDeleteRecompense() {
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await deleteDoc(doc(db, recompenseDoc(id)))
    },
  })
}

/** Quick toggle for the "disponible" flag — separate from full update
 *  to make the disponible switch on the catalog row a one-liner. */
export function useToggleRecompenseDisponibilite() {
  const update = useUpdateRecompense()
  return {
    ...update,
    toggle: (id: string, current: boolean) =>
      update.mutate({ id, disponible: !current }),
  }
}
