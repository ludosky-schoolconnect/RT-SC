/**
 * RT-SC · Colles — read + write hooks.
 *
 * Lives at /classes/{cid}/eleves/{eid}/colles/{auto}
 * Each doc records hours of detention given to the élève for a period.
 * Total hours / 2 = points deducted from baseConduite.
 *
 * Rules: profs can add a colle; only PP (or admin) can delete.
 */

import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addDoc,
  collection,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
} from 'firebase/firestore'
import { db, docRef } from '@/firebase'
import { collesCol } from '@/lib/firestore-keys'
import type { Colle, Periode } from '@/types/models'

const FIVE_MIN = 5 * 60_000

export function useColles(classeId: string | undefined, eleveId: string | undefined) {
  const qc = useQueryClient()

  useEffect(() => {
    if (!classeId || !eleveId) return
    const unsub = onSnapshot(
      query(collection(db, collesCol(classeId, eleveId)), orderBy('date', 'desc')),
      (snap) => {
        const list: Colle[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Colle, 'id'>),
        }))
        qc.setQueryData(['colles', classeId, eleveId], list)
      },
      (err) => console.error('[useColles] snapshot error:', err)
    )
    return unsub
  }, [classeId, eleveId, qc])

  return useQuery<Colle[]>({
    queryKey: ['colles', classeId ?? 'none', eleveId ?? 'none'],
    enabled: !!classeId && !!eleveId,
    queryFn: async () =>
      qc.getQueryData<Colle[]>(['colles', classeId, eleveId]) ?? [],
    staleTime: FIVE_MIN,
  })
}

export interface AddColleInput {
  classeId: string
  eleveId: string
  periode: Periode
  matiere: string
  heures: number
  professeurId: string
  motif?: string
}

export function useAddColle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: AddColleInput) => {
      const data: Record<string, unknown> = {
        periode: input.periode,
        matiere: input.matiere,
        heures: input.heures,
        professeurId: input.professeurId,
        date: serverTimestamp(),
      }
      if (input.motif && input.motif.trim()) {
        data.motif = input.motif.trim()
      }
      await addDoc(collection(db, collesCol(input.classeId, input.eleveId)), data)
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['colles', vars.classeId, vars.eleveId] })
    },
  })
}

export function useDeleteColle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: {
      classeId: string
      eleveId: string
      colleId: string
    }) => {
      await deleteDoc(
        docRef(`${collesCol(args.classeId, args.eleveId)}/${args.colleId}`)
      )
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['colles', vars.classeId, vars.eleveId] })
    },
  })
}

/**
 * Pure helper: total hours for a given period.
 */
export function totalHeuresForPeriode(colles: Colle[], periode: Periode): number {
  return colles
    .filter((c) => c.periode === periode)
    .reduce((sum, c) => sum + (c.heures ?? 0), 0)
}
