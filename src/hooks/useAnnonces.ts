/**
 * RT-SC · useAnnonces — live Firestore subscription for announcements.
 *
 * Two shapes:
 *   - useAllAnnonces()                   → admin view, all annonces
 *   - useAnnoncesFor(classeIds)          → filtered by scope + expiration
 *
 * Uses onSnapshot piped into TanStack Query cache so components can
 * consume via useQuery without each one opening a separate listener.
 */

import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '@/firebase'
import { annoncesCol } from '@/lib/firestore-keys'
import type { Annonce } from '@/types/models'

const ALL_KEY = ['annonces', 'all']

export function useAllAnnonces() {
  const qc = useQueryClient()

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, annoncesCol()), orderBy('createdAt', 'desc')),
      (snap) => {
        const list: Annonce[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Annonce, 'id'>),
        }))
        qc.setQueryData(ALL_KEY, list)
      },
      (err) => console.error('[useAllAnnonces] snapshot error:', err)
    )
    return () => unsub()
  }, [qc])

  return useQuery<Annonce[]>({
    queryKey: ALL_KEY,
    initialData: [],
    staleTime: Infinity, // snapshot keeps it fresh
  })
}

/**
 * Filter annonces for a consumer: not expired, and scope matches one of
 * the classeIds provided (or scope === 'school').
 *
 * Accepts an array of classeIds so a parent with multiple linked
 * children sees annonces targeting ANY of their classes.
 */
export function useAnnoncesFor(classeIds: string[]) {
  const { data: all = [] } = useAllAnnonces()

  const now = Date.now()
  const setOfClasseIds = new Set(classeIds)

  return all.filter((a) => {
    // Expiration
    if (a.expiresAt && a.expiresAt.toMillis() < now) return false

    // Scope
    if (a.scope.kind === 'school') return true
    return a.scope.classeIds.some((id) => setOfClasseIds.has(id))
  })
}
