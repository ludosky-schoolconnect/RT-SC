/**
 * RT-SC · Quêtes hooks (Phase 2).
 *
 * Manages the quests catalog at /quetes and per-quest claims at
 * /quetes/{qid}/claims/{cid}.
 *
 * Read patterns:
 *   - useAllQuetes() — admin master list, includes all statuts
 *   - useOpenQuetesForEleve(classeId) — what a student can claim
 *     (statut === 'ouverte', slot-available, classFilter matches or
 *     null)
 *   - useQueteClaims(queteId) — admin per-quest claim list
 *   - useMyClaims(eleveId) — student's own claim history (across
 *     all quests, via collection-group query)
 *
 * Write patterns:
 *   - useCreateQuete()
 *   - useUpdateQuete()    (limited fields once claims exist)
 *   - useCancelQuete()              (admin marks annulee, pending claims deleted)
 *   - useClaimQuete()               (atomic: creates claim + bumps slotsTaken)
 *   - useValidateClaim()            (atomic: claim + quest counter + eleve points)
 *   - useRejectClaim()              (atomic: delete claim + free up slot)
 *   - useValidateAllPendingClaims() (bulk validate, sequential TXs)
 *
 * Atomicity uses Firestore writeBatch — required because partial
 * failures would corrupt the slot accounting.
 */

import { useEffect } from 'react'
import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { db } from '@/firebase'
import {
  quetesCol,
  queteDoc,
  queteClaimsCol,
  queteClaimDoc,
  eleveDoc,
  civismeHistoryCol,
} from '@/lib/firestore-keys'
import { generateTicketCode } from '@/lib/tickets'
import { CIVISME_FLOOR, CIVISME_CEILING } from '@/hooks/useCivisme'
import type {
  Quete,
  QueteClaim,
  QueteStatut,
} from '@/types/models'

const FIVE_MIN = 5 * 60_000

// ─── Read: admin all quetes ──────────────────────────────────

// Track which query keys have received their first snapshot, so we
// can hold isLoading=true until real data arrives. Without this,
// queryFn returning [] immediately causes a split-second flash of
// "empty state" before the snapshot fires. Shared across hooks.
const firstSnapshotSeen = new Set<string>()

function keyFor(parts: unknown[]): string {
  return JSON.stringify(parts)
}

// ─── Read: admin all quetes ──────────────────────────────────

export function useAllQuetes() {
  const qc = useQueryClient()
  const key = ['quetes', 'all']
  const keyId = keyFor(key)

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, quetesCol()), orderBy('createdAt', 'desc')),
      (snap) => {
        const list: Quete[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Quete, 'id'>),
        }))
        qc.setQueryData(key, list)
        firstSnapshotSeen.add(keyId)
      },
      (err) => {
        // Snapshot failed (missing composite index, permission denied,
        // network error). Mark the key as "seen" and publish an empty
        // list so queryFn can resolve and UI falls through to the
        // empty state instead of spinning forever.
        console.error('[useAllQuetes] snapshot error:', err)
        firstSnapshotSeen.add(keyId)
        qc.setQueryData(key, [])
        qc.invalidateQueries({ queryKey: key })
      }
    )
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return useQuery<Quete[]>({
    queryKey: key,
    queryFn: async () => {
      const cached = qc.getQueryData<Quete[]>(key)
      if (cached !== undefined) return cached
      if (firstSnapshotSeen.has(keyId)) return []
      // First load, no snapshot yet — wait indefinitely; the
      // snapshot listener will populate the cache and trigger
      // a re-render. Returning a never-resolving promise keeps
      // isLoading=true until data arrives.
      return new Promise<Quete[]>(() => {})
    },
    staleTime: FIVE_MIN,
  })
}

// ─── Read: open quetes visible to a specific eleve ───────────

export function useOpenQuetesForEleve(classeId: string | undefined) {
  const qc = useQueryClient()
  const key = ['quetes', 'open', classeId ?? '(none)']
  const keyId = keyFor(key)

  useEffect(() => {
    if (!classeId) return
    const unsub = onSnapshot(
      query(
        collection(db, quetesCol()),
        where('statut', '==', 'ouverte'),
        orderBy('createdAt', 'desc')
      ),
      (snap) => {
        const list: Quete[] = []
        for (const d of snap.docs) {
          const data = d.data() as Omit<Quete, 'id'>
          if (data.classeIdFilter && data.classeIdFilter !== classeId) continue
          if (data.slotsTaken >= data.slotsTotal) continue
          list.push({ id: d.id, ...data })
        }
        qc.setQueryData(key, list)
        firstSnapshotSeen.add(keyId)
      },
      (err) => {
        console.error('[useOpenQuetesForEleve] snapshot error:', err)
        firstSnapshotSeen.add(keyId)
        qc.setQueryData(key, [])
        qc.invalidateQueries({ queryKey: key })
      }
    )
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classeId])

  return useQuery<Quete[]>({
    queryKey: key,
    queryFn: async () => {
      const cached = qc.getQueryData<Quete[]>(key)
      if (cached !== undefined) return cached
      if (firstSnapshotSeen.has(keyId)) return []
      return new Promise<Quete[]>(() => {})
    },
    enabled: Boolean(classeId),
    staleTime: FIVE_MIN,
  })
}

// ─── Read: claims for a specific quete (admin view) ──────────

export function useQueteClaims(queteId: string | undefined) {
  const qc = useQueryClient()
  const key = ['queteClaims', queteId ?? '(none)']

  useEffect(() => {
    if (!queteId) return
    const unsub = onSnapshot(
      query(collection(db, queteClaimsCol(queteId)), orderBy('claimedAt', 'desc')),
      (snap) => {
        const list: QueteClaim[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<QueteClaim, 'id'>),
        }))
        qc.setQueryData(key, list)
      },
      (err) => console.error('[useQueteClaims] snapshot error:', err)
    )
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queteId])

  return useQuery<QueteClaim[]>({
    queryKey: key,
    queryFn: async () => qc.getQueryData<QueteClaim[]>(key) ?? [],
    enabled: Boolean(queteId),
    staleTime: FIVE_MIN,
  })
}

// ─── Read: my claims (student + prof browsing their work) ────

export function useMyClaims(eleveId: string | undefined) {
  const qc = useQueryClient()
  const key = ['myClaims', eleveId ?? '(none)']
  const keyId = keyFor(key)

  useEffect(() => {
    if (!eleveId) return
    const unsub = onSnapshot(
      query(
        collectionGroup(db, 'claims'),
        where('eleveId', '==', eleveId),
        orderBy('claimedAt', 'desc')
      ),
      (snap) => {
        const list: QueteClaim[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<QueteClaim, 'id'>),
        }))
        qc.setQueryData(key, list)
        firstSnapshotSeen.add(keyId)
      },
      (err) => {
        console.error('[useMyClaims] snapshot error:', err)
        firstSnapshotSeen.add(keyId)
        qc.setQueryData(key, [])
        qc.invalidateQueries({ queryKey: key })
      }
    )
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eleveId])

  return useQuery<QueteClaim[]>({
    queryKey: key,
    queryFn: async () => {
      const cached = qc.getQueryData<QueteClaim[]>(key)
      if (cached !== undefined) return cached
      if (firstSnapshotSeen.has(keyId)) return []
      return new Promise<QueteClaim[]>(() => {})
    },
    enabled: Boolean(eleveId),
    staleTime: FIVE_MIN,
  })
}

// ─── Pending claims summary (admin badge counter) ────────────
//
// Used to populate the "Quêtes" sub-nav badge with the count of
// claims awaiting validation across all quests.

export function usePendingClaimsCount() {
  const qc = useQueryClient()
  const key = ['pendingClaimsCount']

  useEffect(() => {
    const unsub = onSnapshot(
      query(
        collectionGroup(db, 'claims'),
        where('statut', '==', 'pending')
      ),
      (snap) => {
        qc.setQueryData(key, snap.size)
      },
      (err) => console.error('[usePendingClaimsCount] snapshot error:', err)
    )
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // initialData seeds the cache on first subscribe. This keeps the
  // value stable at 0 until the snapshot arrives — no mid-render
  // cache mutations, no visible flicker.
  return useQuery<number>({
    queryKey: key,
    queryFn: async () => qc.getQueryData<number>(key) ?? 0,
    initialData: 0,
    staleTime: FIVE_MIN,
  })
}

// ─── Write: create quete ─────────────────────────────────────

export interface CreateQueteInput {
  titre: string
  description?: string
  pointsRecompense: number
  slotsTotal: number
  classeIdFilter?: string
  classeNomFilter?: string
  echeance?: Date
  createdBy: string
}

export function useCreateQuete() {
  return useMutation({
    mutationFn: async (input: CreateQueteInput): Promise<{ id: string }> => {
      const ref = await addDoc(collection(db, quetesCol()), {
        titre: input.titre.trim(),
        ...(input.description?.trim()
          ? { description: input.description.trim() }
          : {}),
        pointsRecompense: Math.max(1, Math.round(input.pointsRecompense)),
        slotsTotal: Math.max(1, Math.round(input.slotsTotal)),
        slotsTaken: 0,
        slotsValidated: 0,
        ...(input.classeIdFilter
          ? {
              classeIdFilter: input.classeIdFilter,
              classeNomFilter: input.classeNomFilter ?? '',
            }
          : {}),
        ...(input.echeance ? { echeance: Timestamp.fromDate(input.echeance) } : {}),
        statut: 'ouverte' as QueteStatut,
        createdAt: serverTimestamp(),
        createdBy: input.createdBy,
      })
      return { id: ref.id }
    },
  })
}

// ─── Write: update quete (limited fields when claims exist) ─

export interface UpdateQueteInput {
  id: string
  titre?: string
  description?: string
  pointsRecompense?: number
  slotsTotal?: number
  echeance?: Date | null  // null = clear
}

export function useUpdateQuete() {
  return useMutation({
    mutationFn: async (input: UpdateQueteInput): Promise<void> => {
      const ref = doc(db, queteDoc(input.id))
      const snap = await getDoc(ref)
      if (!snap.exists()) throw new Error('Quête introuvable.')
      const current = snap.data() as Quete

      const patch: Record<string, unknown> = { updatedAt: serverTimestamp() }
      if (input.titre !== undefined) patch.titre = input.titre.trim()
      if (input.description !== undefined) {
        patch.description = input.description.trim()
      }
      if (input.pointsRecompense !== undefined) {
        // We allow changing the points but flag it loudly in the UI —
        // existing claims keep their original snapshot in the claim doc.
        patch.pointsRecompense = Math.max(1, Math.round(input.pointsRecompense))
      }
      if (input.slotsTotal !== undefined) {
        const newSlots = Math.max(1, Math.round(input.slotsTotal))
        if (newSlots < current.slotsTaken) {
          throw new Error(
            `Impossible de réduire à ${newSlots} créneaux : ${current.slotsTaken} déjà pris.`
          )
        }
        patch.slotsTotal = newSlots

        // Re-evaluate statut based on new slot count.
        //   - Was 'complete' (slots were full) → if we now have spare
        //     slots, flip back to 'ouverte' so new claims can come in.
        //   - Was 'ouverte' but we're lowering slots to exactly full →
        //     flip to 'complete'.
        // Never touch statut if it's 'cloturee' or 'annulee' (admin
        // explicitly closed/cancelled — respect that).
        if (current.statut === 'complete' && newSlots > current.slotsTaken) {
          patch.statut = 'ouverte' as QueteStatut
        } else if (current.statut === 'ouverte' && newSlots === current.slotsTaken) {
          patch.statut = 'complete' as QueteStatut
        }
      }
      if (input.echeance === null) {
        // explicit clear — Firestore deletes via FieldValue, but to keep
        // dependency-light we just write null and let the model accept it
        patch.echeance = null
      } else if (input.echeance instanceof Date) {
        patch.echeance = Timestamp.fromDate(input.echeance)
      }

      await updateDoc(ref, patch)
    },
  })
}

// ─── Write: cancel quete (closes + rejects open claims) ─────

export function useCancelQuete() {
  return useMutation({
    mutationFn: async (queteId: string): Promise<void> => {
      const batch = writeBatch(db)
      const queteRef = doc(db, queteDoc(queteId))
      batch.update(queteRef, {
        statut: 'annulee' as QueteStatut,
        updatedAt: serverTimestamp(),
      })

      // Delete all pending claims — the quest is gone, no reason to keep them.
      // Validated claims are untouched (those students already got their points).
      const claimsSnap = await getDocs(
        query(collection(db, queteClaimsCol(queteId)), where('statut', '==', 'pending'))
      )
      for (const cd of claimsSnap.docs) {
        batch.delete(cd.ref)
      }

      await batch.commit()
    },
  })
}

// ─── Write: delete quete (only if zero claims) ──────────────

export function useDeleteQuete() {
  return useMutation({
    mutationFn: async (queteId: string): Promise<void> => {
      // Cascade-delete: claims subcollection goes first, then the quête
      // doc itself. This is the "hard" alternative to cancelling. The
      // student's civismeHistory entries survive (they denormalize the
      // quête title, so the student's "Quête accomplie : Nettoyage des
      // locaux +5 pts" row remains readable even after deletion).
      // Pending claims vanish from students' "Mes quêtes" list —
      // acceptable since admin pulled the quête deliberately.
      const { getDocs, collection: c, writeBatch } = await import(
        'firebase/firestore'
      )
      const claimsSnap = await getDocs(c(db, queteClaimsCol(queteId)))

      // Firestore batches cap at 500 ops. If somehow a quête has
      // hundreds of claims (unlikely given school scale), we chunk.
      const allDocs = [...claimsSnap.docs]
      for (let i = 0; i < allDocs.length; i += 450) {
        const chunk = allDocs.slice(i, i + 450)
        const batch = writeBatch(db)
        for (const cd of chunk) batch.delete(cd.ref)
        await batch.commit()
      }

      await deleteDoc(doc(db, queteDoc(queteId)))
    },
  })
}

// ─── Write: claim a quest slot ──────────────────────────────

export interface ClaimQueteInput {
  queteId: string
  /** Snapshot fields denormalized at claim time — saves reads later */
  queteTitre: string
  pointsRecompense: number
  // Who's earning
  eleveId: string
  eleveNom: string
  classeId: string
  classeNom: string
  // Who's submitting
  claimedBy: 'eleve' | 'prof' | 'admin'
  claimedByUid: string
  claimedByNom?: string
}

export function useClaimQuete() {
  return useMutation({
    mutationFn: async (input: ClaimQueteInput): Promise<{ claimId: string; ticketCode: string }> => {
      const queteRef = doc(db, queteDoc(input.queteId))
      // Generate ticket code client-side (no collision check — see tickets.ts)
      const ticketCode = generateTicketCode('T')

      // Claims live as a subcollection — addDoc to get auto ID.
      // We use a batch to also bump slotsTaken atomically and (if last
      // slot) flip statut to 'complete'.
      const claimRef = doc(collection(db, queteClaimsCol(input.queteId)))

      // We need to read the current quete to know if THIS claim fills
      // the last slot. A quick read here is unavoidable: Firestore
      // batches don't support read-then-write logic without a transaction.
      // We use a transaction instead of batch for race safety.
      await runTransaction(db, async (tx) => {
          const snap = await tx.get(queteRef)
          if (!snap.exists()) throw new Error('Quête introuvable.')
          const q = snap.data() as Quete

          if (q.statut !== 'ouverte') {
            throw new Error('Cette quête n\'accepte plus de réclamations.')
          }
          if (q.slotsTaken >= q.slotsTotal) {
            throw new Error('Tous les créneaux de cette quête sont déjà pris.')
          }
          if (q.classeIdFilter && q.classeIdFilter !== input.classeId) {
            throw new Error('Cette quête est réservée à une autre classe.')
          }

          const newSlotsTaken = q.slotsTaken + 1
          const becameComplete = newSlotsTaken >= q.slotsTotal

          tx.set(claimRef, {
            queteId: input.queteId,
            queteTitre: input.queteTitre,
            pointsRecompense: input.pointsRecompense,
            eleveId: input.eleveId,
            eleveNom: input.eleveNom,
            classeId: input.classeId,
            classeNom: input.classeNom,
            claimedBy: input.claimedBy,
            claimedByUid: input.claimedByUid,
            ...(input.claimedByNom ? { claimedByNom: input.claimedByNom } : {}),
            claimedAt: serverTimestamp(),
            statut: 'pending',
            ticketCode,
          })

          tx.update(queteRef, {
            slotsTaken: newSlotsTaken,
            ...(becameComplete ? { statut: 'complete' as QueteStatut } : {}),
            updatedAt: serverTimestamp(),
          })
        })

      return { claimId: claimRef.id, ticketCode }
    },
  })
}

// ─── Write: validate a claim (award points) ─────────────────

export interface ValidateClaimInput {
  queteId: string
  claimId: string
  /** Validator identity (denormalized into the claim doc) */
  validatedByUid: string
  validatedByNom?: string
}

export function useValidateClaim() {
  return useMutation({
    mutationFn: async (input: ValidateClaimInput): Promise<{ newBalance: number }> => {
      // Atomic: read claim + read eleve, write claim status, increment
      // eleve points, bump slotsValidated on quete.
      let newBalance = 0
      await runTransaction(db, async (tx) => {
          const claimRef = doc(db, queteClaimDoc(input.queteId, input.claimId))
          const queteRef = doc(db, queteDoc(input.queteId))

          const claimSnap = await tx.get(claimRef)
          if (!claimSnap.exists()) throw new Error('Réclamation introuvable.')
          const claim = claimSnap.data() as QueteClaim

          if (claim.statut !== 'pending') {
            throw new Error(`Cette réclamation n'est plus en attente (statut: ${claim.statut}).`)
          }

          const eleveRef = doc(db, eleveDoc(claim.classeId, claim.eleveId))
          const eleveSnap = await tx.get(eleveRef)
          if (!eleveSnap.exists()) throw new Error('Élève introuvable.')
          const eleveData = eleveSnap.data() as { civismePoints?: number }
          const current = eleveData.civismePoints ?? 0
          newBalance = Math.max(
            CIVISME_FLOOR,
            Math.min(CIVISME_CEILING, current + claim.pointsRecompense)
          )

          tx.update(claimRef, {
            statut: 'validated',
            validatedAt: serverTimestamp(),
            validatedByUid: input.validatedByUid,
            ...(input.validatedByNom ? { validatedByNom: input.validatedByNom } : {}),
          })

          tx.update(eleveRef, { civismePoints: newBalance })

          tx.update(queteRef, {
            slotsValidated: increment(1),
            updatedAt: serverTimestamp(),
          })

          // Phase 3 — append civismeHistory entry so the student and
          // parent see the gain on their history panel. Same transaction
          // ensures balance + history stay consistent.
          const historyRef = doc(
            collection(db, civismeHistoryCol(claim.classeId, claim.eleveId))
          )
          tx.set(historyRef, {
            delta: claim.pointsRecompense,
            raison: 'quete',
            reference: {
              type: 'quete',
              id: input.queteId,
              label: claim.queteTitre,
            },
            date: serverTimestamp(),
            parUid: input.validatedByUid,
            ...(input.validatedByNom ? { parNom: input.validatedByNom } : {}),
            soldeApres: newBalance,
          })
        })
      return { newBalance }
    },
  })
}

// ─── Write: reject a claim (delete doc + free up the slot) ──

export interface RejectClaimInput {
  queteId: string
  claimId: string
}

export function useRejectClaim() {
  return useMutation({
    mutationFn: async (input: RejectClaimInput): Promise<void> => {
      await runTransaction(db, async (tx) => {
        const claimRef = doc(db, queteClaimDoc(input.queteId, input.claimId))
        const queteRef = doc(db, queteDoc(input.queteId))

        const claimSnap = await tx.get(claimRef)
        if (!claimSnap.exists()) throw new Error('Réclamation introuvable.')
        const claim = claimSnap.data() as QueteClaim

        if (claim.statut !== 'pending') {
          throw new Error(`Cette réclamation n'est plus en attente.`)
        }

        // Delete the claim — no point keeping a rejected doc around.
        tx.delete(claimRef)

        // Free the slot; reopen quest if it was 'complete' and now has room.
        const queteSnap = await tx.get(queteRef)
        if (queteSnap.exists()) {
          const q = queteSnap.data() as Quete
          const newSlotsTaken = Math.max(0, q.slotsTaken - 1)
          const patch: Record<string, unknown> = {
            slotsTaken: newSlotsTaken,
            updatedAt: serverTimestamp(),
          }
          if (q.statut === 'complete' && newSlotsTaken < q.slotsTotal) {
            patch.statut = 'ouverte' as QueteStatut
          }
          tx.update(queteRef, patch)
        }
      })
    },
  })
}

// ─── Write: validate all pending claims for a quest ─────────

export interface ValidateAllPendingClaimsInput {
  queteId: string
  validatedByUid: string
  validatedByNom?: string
}

export function useValidateAllPendingClaims() {
  return useMutation({
    mutationFn: async (
      input: ValidateAllPendingClaimsInput
    ): Promise<{ count: number }> => {
      const snap = await getDocs(
        query(
          collection(db, queteClaimsCol(input.queteId)),
          where('statut', '==', 'pending')
        )
      )
      const claims = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<QueteClaim, 'id'>),
      }))

      // Validate sequentially — each TX re-reads current eleve balance so
      // sequential point credits are correct even if same student appears twice.
      let count = 0
      for (const claim of claims) {
        await runTransaction(db, async (tx) => {
          const claimRef = doc(db, queteClaimDoc(input.queteId, claim.id))
          const queteRef = doc(db, queteDoc(input.queteId))

          const claimSnap = await tx.get(claimRef)
          // Skip if already handled by a concurrent action
          if (!claimSnap.exists()) return
          if ((claimSnap.data() as QueteClaim).statut !== 'pending') return

          const eleveRef = doc(db, eleveDoc(claim.classeId, claim.eleveId))
          const eleveSnap = await tx.get(eleveRef)
          if (!eleveSnap.exists()) return
          const eleveData = eleveSnap.data() as { civismePoints?: number }
          const current = eleveData.civismePoints ?? 0
          const newBalance = Math.max(
            CIVISME_FLOOR,
            Math.min(CIVISME_CEILING, current + claim.pointsRecompense)
          )

          tx.update(claimRef, {
            statut: 'validated',
            validatedAt: serverTimestamp(),
            validatedByUid: input.validatedByUid,
            ...(input.validatedByNom ? { validatedByNom: input.validatedByNom } : {}),
          })
          tx.update(eleveRef, { civismePoints: newBalance })
          tx.update(queteRef, {
            slotsValidated: increment(1),
            updatedAt: serverTimestamp(),
          })

          const historyRef = doc(
            collection(db, civismeHistoryCol(claim.classeId, claim.eleveId))
          )
          tx.set(historyRef, {
            delta: claim.pointsRecompense,
            raison: 'quete',
            reference: {
              type: 'quete',
              id: input.queteId,
              label: claim.queteTitre,
            },
            date: serverTimestamp(),
            parUid: input.validatedByUid,
            ...(input.validatedByNom ? { parNom: input.validatedByNom } : {}),
            soldeApres: newBalance,
          })

          count++
        })
      }

      return { count }
    },
  })
}
