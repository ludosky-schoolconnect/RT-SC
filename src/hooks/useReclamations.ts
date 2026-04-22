/**
 * RT-SC · Reclamations hooks (Phase 3).
 *
 * Manages reward claims at /reclamations. A reclamation is a
 * student's request to redeem civisme points for a catalog reward.
 *
 * Flow:
 *   1. Student (or prof/admin on their behalf) creates a Reclamation
 *      with statut='demandee'. Points NOT debited yet.
 *   2. Admin reviews the queue in Civisme > Réclamations sub-section.
 *   3. Admin physically hands over the reward, then taps "Fulfilled".
 *      This runs an atomic transaction:
 *        - Reclamation statut → 'fulfillee'
 *        - Eleve civismePoints decreases by pointsCout (clamped to floor)
 *        - civismeHistory entry appended with soldeApres snapshot
 *   4. Alternative: admin rejects/cancels → statut='annulee', no
 *      point change.
 *
 * Why pull-model (request → admin fulfills) instead of auto-debit?
 *   - Physical stock is offline-managed; the app can't verify an item
 *     was actually handed over.
 *   - Cancellations (student changed their mind, out of stock) need
 *     clean handling without refund logic.
 *   - Admin gets a queue they can batch-process at end of day.
 *
 * Read patterns:
 *   - useAllReclamations() — admin queue, all statuts
 *   - usePendingReclamationsCount() — admin badge counter
 *   - useMyReclamations(eleveId) — student sees their own requests
 *
 * Write patterns:
 *   - useCreateReclamation() — request (any of student/prof/admin)
 *   - useFulfillReclamation() — admin only, atomic debit + history
 *   - useCancelReclamation() — admin (or student pre-fulfillment)
 */

import { useEffect } from 'react'
import {
  addDoc,
  collection,
  collectionGroup,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { db } from '@/firebase'
import {
  reclamationsCol,
  reclamationDoc,
  eleveDoc,
  civismeHistoryCol,
} from '@/lib/firestore-keys'
import { generateTicketCode } from '@/lib/tickets'
import { CIVISME_FLOOR, CIVISME_CEILING } from '@/hooks/useCivisme'
import type { Reclamation, ReclamationStatut } from '@/types/models'

const FIVE_MIN = 5 * 60_000

// Shared loading-state tracker — same pattern as useQuetes.
const firstSnapshotSeen = new Set<string>()
function keyFor(parts: unknown[]): string {
  return JSON.stringify(parts)
}

// ─── Read: all reclamations (admin queue) ──────────────────

export function useAllReclamations() {
  const qc = useQueryClient()
  const key = ['reclamations', 'all']
  const keyId = keyFor(key)

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, reclamationsCol()), orderBy('demandeeLe', 'desc')),
      (snap) => {
        const list: Reclamation[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Reclamation, 'id'>),
        }))
        qc.setQueryData(key, list)
        firstSnapshotSeen.add(keyId)
      },
      (err) => {
        console.error('[useAllReclamations] snapshot error:', err)
        firstSnapshotSeen.add(keyId)
        qc.setQueryData(key, [])
        qc.invalidateQueries({ queryKey: key })
      }
    )
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return useQuery<Reclamation[]>({
    queryKey: key,
    queryFn: async () => {
      const cached = qc.getQueryData<Reclamation[]>(key)
      if (cached !== undefined) return cached
      if (firstSnapshotSeen.has(keyId)) return []
      return new Promise<Reclamation[]>(() => {})
    },
    staleTime: FIVE_MIN,
  })
}

// ─── Read: pending count for badge ─────────────────────────

export function usePendingReclamationsCount() {
  const qc = useQueryClient()
  const key = ['pendingReclamationsCount']

  useEffect(() => {
    const unsub = onSnapshot(
      query(
        collection(db, reclamationsCol()),
        where('statut', '==', 'demandee')
      ),
      (snap) => qc.setQueryData(key, snap.size),
      (err) => console.error('[usePendingReclamationsCount] snapshot error:', err)
    )
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return useQuery<number>({
    queryKey: key,
    queryFn: async () => qc.getQueryData<number>(key) ?? 0,
    initialData: 0,
    staleTime: FIVE_MIN,
  })
}

// ─── Read: student's own reclamations ──────────────────────

export function useMyReclamations(eleveId: string | undefined) {
  const qc = useQueryClient()
  const key = ['myReclamations', eleveId ?? '(none)']
  const keyId = keyFor(key)

  useEffect(() => {
    if (!eleveId) return
    const unsub = onSnapshot(
      query(
        collection(db, reclamationsCol()),
        where('eleveId', '==', eleveId),
        orderBy('demandeeLe', 'desc')
      ),
      (snap) => {
        const list: Reclamation[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Reclamation, 'id'>),
        }))
        qc.setQueryData(key, list)
        firstSnapshotSeen.add(keyId)
      },
      (err) => {
        console.error('[useMyReclamations] snapshot error:', err)
        firstSnapshotSeen.add(keyId)
        qc.setQueryData(key, [])
        qc.invalidateQueries({ queryKey: key })
      }
    )
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eleveId])

  return useQuery<Reclamation[]>({
    queryKey: key,
    queryFn: async () => {
      const cached = qc.getQueryData<Reclamation[]>(key)
      if (cached !== undefined) return cached
      if (firstSnapshotSeen.has(keyId)) return []
      return new Promise<Reclamation[]>(() => {})
    },
    enabled: Boolean(eleveId),
    staleTime: FIVE_MIN,
  })
}

// ─── Write: create reclamation ─────────────────────────────

export interface CreateReclamationInput {
  // Target eleve (denormalized)
  eleveId: string
  eleveNom: string
  classeId: string
  classeNom: string
  // Reward (denormalized at request time)
  recompenseId: string
  recompenseNom: string
  pointsCout: number
  // Requester
  demandeeParType: 'eleve' | 'prof' | 'admin'
  demandeeParUid: string
  demandeeParNom?: string
  /** Eleve's CURRENT balance — used to validate affordability */
  currentBalance: number
}

export function useCreateReclamation() {
  return useMutation({
    mutationFn: async (
      input: CreateReclamationInput
    ): Promise<{ id: string; ticketCode: string }> => {
      // Affordability guard — the UI should prevent this too, but
      // defense in depth. Students can't request rewards they can't
      // pay for.
      if (input.currentBalance < input.pointsCout) {
        throw new Error(
          `Solde insuffisant : ${input.currentBalance} pts disponibles, ${input.pointsCout} requis.`
        )
      }

      const ticketCode = generateTicketCode('R')
      const ref = await addDoc(collection(db, reclamationsCol()), {
        eleveId: input.eleveId,
        eleveNom: input.eleveNom,
        classeId: input.classeId,
        classeNom: input.classeNom,
        recompenseId: input.recompenseId,
        recompenseNom: input.recompenseNom,
        pointsCout: input.pointsCout,
        demandeeParType: input.demandeeParType,
        demandeeParUid: input.demandeeParUid,
        ...(input.demandeeParNom
          ? { demandeeParNom: input.demandeeParNom }
          : {}),
        demandeeLe: serverTimestamp(),
        statut: 'demandee' as ReclamationStatut,
        ticketCode,
      })
      return { id: ref.id, ticketCode }
    },
  })
}

// ─── Write: fulfill (admin hands over the reward) ──────────
//
// Atomic transaction: reclamation status + eleve points + history
// entry all in one batch. If any fail, nothing is written.

export interface FulfillReclamationInput {
  reclamationId: string
  fulfilleeParUid: string
  fulfilleeParNom?: string
}

export function useFulfillReclamation() {
  return useMutation({
    mutationFn: async (
      input: FulfillReclamationInput
    ): Promise<{ newBalance: number }> => {
      let newBalance = 0
      await runTransaction(db, async (tx) => {
        const reclRef = doc(db, reclamationDoc(input.reclamationId))
        const reclSnap = await tx.get(reclRef)
        if (!reclSnap.exists()) throw new Error('Réclamation introuvable.')
        const recl = reclSnap.data() as Reclamation

        if (recl.statut !== 'demandee') {
          throw new Error(
            `Cette réclamation n'est plus en attente (statut: ${recl.statut}).`
          )
        }

        const eleveRef = doc(db, eleveDoc(recl.classeId, recl.eleveId))
        const eleveSnap = await tx.get(eleveRef)
        if (!eleveSnap.exists()) throw new Error('Élève introuvable.')
        const eleveData = eleveSnap.data() as { civismePoints?: number }
        const currentPts = eleveData.civismePoints ?? 0

        // Refuse to fulfill if eleve can no longer afford it. This
        // catches the edge case where points were spent on another
        // reward between request and fulfillment, or incidents
        // depleted the balance.
        if (currentPts < recl.pointsCout) {
          throw new Error(
            `Solde insuffisant pour honorer : ${currentPts} pts disponibles, ${recl.pointsCout} requis. Annulez la réclamation.`
          )
        }

        newBalance = Math.max(
          CIVISME_FLOOR,
          Math.min(CIVISME_CEILING, currentPts - recl.pointsCout)
        )

        // Update reclamation
        tx.update(reclRef, {
          statut: 'fulfillee' as ReclamationStatut,
          fulfilleeLe: serverTimestamp(),
          fulfilleeParUid: input.fulfilleeParUid,
          ...(input.fulfilleeParNom
            ? { fulfilleeParNom: input.fulfilleeParNom }
            : {}),
        })

        // Debit points on eleve
        tx.update(eleveRef, { civismePoints: newBalance })

        // Append history entry
        const historyRef = doc(
          collection(db, civismeHistoryCol(recl.classeId, recl.eleveId))
        )
        tx.set(historyRef, {
          delta: -recl.pointsCout,
          raison: 'reclamation',
          reference: {
            type: 'reclamation',
            id: input.reclamationId,
            label: recl.recompenseNom,
          },
          date: serverTimestamp(),
          parUid: input.fulfilleeParUid,
          ...(input.fulfilleeParNom ? { parNom: input.fulfilleeParNom } : {}),
          soldeApres: newBalance,
        })
      })
      return { newBalance }
    },
  })
}

// ─── Write: cancel reclamation (before fulfillment) ────────

export interface CancelReclamationInput {
  reclamationId: string
  reason?: string
  cancelledByUid: string
  cancelledByNom?: string
}

export function useCancelReclamation() {
  return useMutation({
    mutationFn: async (input: CancelReclamationInput): Promise<void> => {
      const ref = doc(db, reclamationDoc(input.reclamationId))
      const snap = await getDoc(ref)
      if (!snap.exists()) throw new Error('Réclamation introuvable.')
      const recl = snap.data() as Reclamation
      if (recl.statut !== 'demandee') {
        throw new Error(
          `Impossible d'annuler : statut actuel ${recl.statut}.`
        )
      }
      await runTransaction(db, async (tx) => {
        tx.update(ref, {
          statut: 'annulee' as ReclamationStatut,
          annuleeLe: serverTimestamp(),
          annuleeParUid: input.cancelledByUid,
          ...(input.cancelledByNom
            ? { annuleeParNom: input.cancelledByNom }
            : {}),
          ...(input.reason?.trim()
            ? { annulationReason: input.reason.trim() }
            : {}),
        })
      })
    },
  })
}
