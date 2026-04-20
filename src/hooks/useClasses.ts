/**
 * RT-SC · Classes — read hooks (live snapshots).
 *
 * Uses Firestore onSnapshot wrapped in a React state, then mirrored into
 * TanStack Query so the cache key is consistent across the app.
 *
 * Why live: admin team can have multiple people editing simultaneously.
 * One admin creates a class — every other admin's screen updates instantly.
 *
 * Cost: one open subscription per active query. Cheap for the class list
 * (~30 docs typically) and the per-class élève counts.
 */

import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  getDoc,
  getCountFromServer,
} from 'firebase/firestore'
import { db, docRef } from '@/firebase'
import { classesCol, classeDoc, elevesCol } from '@/lib/firestore-keys'
import type { Classe } from '@/types/models'

const FIVE_MIN = 5 * 60_000

// ─── Live list of all classes ───────────────────────────────

export function useClasses() {
  const qc = useQueryClient()

  // Subscribe once per mount; push updates straight into the query cache.
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, classesCol()), orderBy('niveau')),
      (snap) => {
        const list: Classe[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Classe, 'id'>),
        }))
        qc.setQueryData(['classes'], list)
      },
      (err) => console.error('[useClasses] snapshot error:', err)
    )
    return unsub
  }, [qc])

  return useQuery<Classe[]>({
    queryKey: ['classes'],
    queryFn: async () => qc.getQueryData<Classe[]>(['classes']) ?? [],
    staleTime: FIVE_MIN,
  })
}

// ─── Single class (one-shot read, refreshable) ──────────────

export function useClasse(classeId: string | undefined) {
  return useQuery({
    queryKey: ['classe', classeId],
    enabled: !!classeId,
    queryFn: async (): Promise<Classe | null> => {
      if (!classeId) return null
      const snap = await getDoc(docRef(classeDoc(classeId)))
      if (!snap.exists()) return null
      return { id: snap.id, ...(snap.data() as Omit<Classe, 'id'>) }
    },
    staleTime: FIVE_MIN,
  })
}

// ─── Élève count for one class — uses getCountFromServer (1 read) ───

export function useClasseEleveCount(classeId: string | undefined) {
  return useQuery({
    queryKey: ['classe', classeId, 'eleve-count'],
    enabled: !!classeId,
    queryFn: async (): Promise<number> => {
      if (!classeId) return 0
      const snap = await getCountFromServer(collection(db, elevesCol(classeId)))
      return snap.data().count
    },
    staleTime: 2 * 60_000,
  })
}
