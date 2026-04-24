/**
 * RT-SC · Reclamations hooks (Phase 3 — soft-deduct model).
 *
 * Manages reward claims at /reclamations. A reclamation is a
 * student's request to redeem civisme points for a catalog reward.
 *
 * Flow (updated):
 *   1. Student (or prof/admin on their behalf) creates a Reclamation
 *      via useCreateReclamation. Points are IMMEDIATELY debited
 *      atomically — soft-deduct at request time.
 *   2. Admin reviews the queue in Civisme > Réclamations sub-section.
 *   3. Admin physically hands over the reward, then taps "Fulfilled".
 *      This updates statut → 'fulfillee' only — no balance change.
 *   4. Alternative: admin (or student) cancels → statut='annulee'
 *      and points are REFUNDED atomically.
 *
 * Read patterns:
 *   - useAllReclamations() — admin queue, all statuts
 *   - usePendingReclamationsCount() — admin badge counter
 *   - useMyReclamations(eleveId) — student sees their own requests
 *
 * Write patterns:
 *   - useCreateReclamation() — request + immediate point debit (TX)
 *   - useFulfillReclamation() — admin only, status update only (no balance change)
 *   - useCancelReclamation() — admin or student, refunds points (TX)
 */

import { useEffect } from 'react'
import {
  collection,
  doc,
  increment,
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

// Suppress unused lint warning — increment imported for future use
void increment

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
      // No orderBy — where(eleveId) + orderBy(demandeeLe) requires a
      // composite index. Sort client-side instead.
      query(collection(db, reclamationsCol()), where('eleveId', '==', eleveId)),
      (snap) => {
        const list: Reclamation[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Reclamation, 'id'>),
        }))
        list.sort((a, b) => {
          const aMs = (a.demandeeLe as { toMillis?: () => number })?.toMillis?.() ?? 0
          const bMs = (b.demandeeLe as { toMillis?: () => number })?.toMillis?.() ?? 0
          return bMs - aMs
        })
        qc.setQueryData(key, list)
        firstSnapshotSeen.add(keyId)
      },
      (err) => {
        console.error('[useMyReclamations] snapshot error:', err)
        firstSnapshotSeen.add(keyId)
        if (qc.getQueryData(key) === undefined) qc.setQueryData(key, [])
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

// ─── Write: create reclamation (soft-deduct at request time) ─

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
}

export function useCreateReclamation() {
  return useMutation({
    mutationFn: async (
      input: CreateReclamationInput
    ): Promise<{ id: string; ticketCode: string }> => {
      const ticketCode = generateTicketCode('R')

      // Pre-allocate the ref so we know the ID for the history entry
      const reclRef = doc(collection(db, reclamationsCol()))

      await runTransaction(db, async (tx) => {
        // Read eleve balance inside TX — source of truth
        const eleveRef = doc(db, eleveDoc(input.classeId, input.eleveId))
        const eleveSnap = await tx.get(eleveRef)
        if (!eleveSnap.exists()) throw new Error('Élève introuvable.')
        const eleveData = eleveSnap.data() as { civismePoints?: number }
        const current = eleveData.civismePoints ?? 0

        // Validate affordability (atomic check inside TX)
        if (current < input.pointsCout) {
          throw new Error(
            `Solde insuffisant : ${current} pts disponibles, ${input.pointsCout} requis.`
          )
        }

        const newBalance = Math.max(
          CIVISME_FLOOR,
          Math.min(CIVISME_CEILING, current - input.pointsCout)
        )

        // Create reclamation
        tx.set(reclRef, {
          eleveId: input.eleveId,
          eleveNom: input.eleveNom,
          classeId: input.classeId,
          classeNom: input.classeNom,
          recompenseId: input.recompenseId,
          recompenseNom: input.recompenseNom,
          pointsCout: input.pointsCout,
          demandeeParType: input.demandeeParType,
          demandeeParUid: input.demandeeParUid,
          ...(input.demandeeParNom ? { demandeeParNom: input.demandeeParNom } : {}),
          demandeeLe: serverTimestamp(),
          statut: 'demandee' as ReclamationStatut,
          ticketCode,
        })

        // Debit points immediately
        tx.update(eleveRef, { civismePoints: newBalance })

        // Write history entry
        const historyRef = doc(
          collection(db, civismeHistoryCol(input.classeId, input.eleveId))
        )
        tx.set(historyRef, {
          delta: -input.pointsCout,
          raison: 'reclamation',
          reference: {
            type: 'reclamation',
            id: reclRef.id,
            label: input.recompenseNom,
          },
          date: serverTimestamp(),
          parUid: input.demandeeParUid,
          ...(input.demandeeParNom ? { parNom: input.demandeeParNom } : {}),
          soldeApres: newBalance,
        })
      })

      return { id: reclRef.id, ticketCode }
    },
  })
}

// ─── Write: fulfill (admin hands over the reward) ──────────
//
// Points are already debited at request time. This just updates status.

export interface FulfillReclamationInput {
  reclamationId: string
  fulfilleeParUid: string
  fulfilleeParNom?: string
}

export function useFulfillReclamation() {
  return useMutation({
    mutationFn: async (
      input: FulfillReclamationInput
    ): Promise<void> => {
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

        // Points already debited at request time — just update status
        tx.update(reclRef, {
          statut: 'fulfillee' as ReclamationStatut,
          fulfilleeLe: serverTimestamp(),
          fulfilleeParUid: input.fulfilleeParUid,
          ...(input.fulfilleeParNom
            ? { fulfilleeParNom: input.fulfilleeParNom }
            : {}),
        })
      })
    },
  })
}

// ─── Write: cancel reclamation — refunds points ────────────

export interface CancelReclamationInput {
  reclamationId: string
  reason?: string
  cancelledByUid: string
  cancelledByNom?: string
}

export function useCancelReclamation() {
  return useMutation({
    mutationFn: async (input: CancelReclamationInput): Promise<void> => {
      await runTransaction(db, async (tx) => {
        const reclRef = doc(db, reclamationDoc(input.reclamationId))
        const reclSnap = await tx.get(reclRef)
        if (!reclSnap.exists()) throw new Error('Réclamation introuvable.')
        const recl = reclSnap.data() as Reclamation

        if (recl.statut !== 'demandee') {
          throw new Error(
            `Impossible d'annuler : statut actuel ${recl.statut}.`
          )
        }

        // Read eleve balance for refund
        const eleveRef = doc(db, eleveDoc(recl.classeId, recl.eleveId))
        const eleveSnap = await tx.get(eleveRef)
        if (!eleveSnap.exists()) throw new Error('Élève introuvable.')
        const eleveData = eleveSnap.data() as { civismePoints?: number }
        const current = eleveData.civismePoints ?? 0

        const refundedBalance = Math.max(
          CIVISME_FLOOR,
          Math.min(CIVISME_CEILING, current + recl.pointsCout)
        )

        // Update reclamation status
        tx.update(reclRef, {
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

        // Refund points
        tx.update(eleveRef, { civismePoints: refundedBalance })

        // Write refund history entry
        const historyRef = doc(
          collection(db, civismeHistoryCol(recl.classeId, recl.eleveId))
        )
        tx.set(historyRef, {
          delta: recl.pointsCout,  // positive — refund
          raison: 'reclamation',
          reference: {
            type: 'reclamation',
            id: input.reclamationId,
            label: `${recl.recompenseNom} (remboursé)`,
          },
          motif: 'Annulation de la demande',
          date: serverTimestamp(),
          parUid: input.cancelledByUid,
          ...(input.cancelledByNom ? { parNom: input.cancelledByNom } : {}),
          soldeApres: refundedBalance,
        })
      })
    },
  })
}
