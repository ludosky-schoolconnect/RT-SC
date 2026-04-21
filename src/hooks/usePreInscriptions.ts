/**
 * RT-SC · Pre-inscriptions — read + write hooks.
 *
 * Live snapshot on the full collection. Filtering by statut happens
 * client-side after fetch (the volume is small — pending dossiers are
 * typically <100 even for big schools, and Firestore would charge per
 * query anyway).
 *
 * Mutations:
 *   - useApproveInscription  → sets statut + classeCible + dateRV (RV slot taken)
 *   - useRefuseInscription   → sets statut + raisonRefus
 *   - useReprogrammerRV      → releases old slot + finds new + writes back
 *   - useDeleteInscription   → hard delete (also wipes docs subcollection)
 *   - useFinalizeInscription → promotes to real élève + records paiement + cleans up
 */

import { useEffect } from 'react'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
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
import {
  elevesCol,
  paiementsCol,
  preInscriptionDoc,
  preInscriptionsCol,
} from '@/lib/firestore-keys'
import {
  computeEarliestStartDate,
  findNextSlot,
  parseDDMMYYYY,
  releaseSlot,
  REPROG_MAX,
} from '@/lib/inscription-rdv'
import { deleteAllDocsForInscription } from '@/lib/inscription-doc-storage'
import { genererCodePin, genererPasskeyParent } from '@/lib/benin'
import type { Paiement, PreInscription } from '@/types/models'

const FIVE_MIN = 5 * 60_000

// ─── Read ─────────────────────────────────────────────────────

export function usePreInscriptions() {
  const qc = useQueryClient()

  useEffect(() => {
    const unsub = onSnapshot(
      query(
        collection(db, preInscriptionsCol()),
        orderBy('dateSoumission', 'desc')
      ),
      (snap) => {
        const list: PreInscription[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<PreInscription, 'id'>),
        }))
        qc.setQueryData(['pre-inscriptions'], list)
      },
      (err) => console.error('[usePreInscriptions] snapshot error:', err)
    )
    return unsub
  }, [qc])

  return useQuery<PreInscription[]>({
    queryKey: ['pre-inscriptions'],
    queryFn: async () =>
      qc.getQueryData<PreInscription[]>(['pre-inscriptions']) ?? [],
    staleTime: FIVE_MIN,
  })
}

// ─── Approve ──────────────────────────────────────────────────

export interface ApproveInscriptionInput {
  inscriptionId: string
  classeId: string
  /** Capacity per day from settings. */
  placesParJour: number
  /** Min days from today before the earliest possible slot. */
  delaiMinJours: number
}

export interface ApproveInscriptionResult {
  dateRV: string
}

export function useApproveInscription() {
  const qc = useQueryClient()

  return useMutation<ApproveInscriptionResult, Error, ApproveInscriptionInput>({
    mutationFn: async (input) => {
      const startDate = computeEarliestStartDate(input.delaiMinJours)
      const slot = await findNextSlot(startDate, input.placesParJour)
      if (!slot) {
        throw new Error(
          `Aucun créneau disponible dans les ${30} prochains jours. Augmentez la capacité ou réessayez plus tard.`
        )
      }

      await updateDoc(doc(db, preInscriptionDoc(input.inscriptionId)), {
        statut: 'Approuvé',
        classeCible: input.classeId,
        dateRV: slot.dateDisplay,
      })

      return { dateRV: slot.dateDisplay }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pre-inscriptions'] })
    },
  })
}

// ─── Refuse ───────────────────────────────────────────────────

export interface RefuseInscriptionInput {
  inscriptionId: string
  raison: string
}

export function useRefuseInscription() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: RefuseInscriptionInput) => {
      await updateDoc(doc(db, preInscriptionDoc(input.inscriptionId)), {
        statut: 'Refusé',
        raisonRefus: input.raison.trim(),
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pre-inscriptions'] })
    },
  })
}

// ─── Reprogrammer RV ──────────────────────────────────────────

export interface ReprogrammerInput {
  inscriptionId: string
  /** Required to compute the new search start date. */
  currentDateRV: string
  /** Current reprog count from the doc (we cap at REPROG_MAX). */
  currentReprogCount: number
  placesParJour: number
}

export function useReprogrammerRV() {
  const qc = useQueryClient()

  return useMutation<ApproveInscriptionResult, Error, ReprogrammerInput>({
    mutationFn: async (input) => {
      if (input.currentReprogCount >= REPROG_MAX) {
        throw new Error(
          `Limite de ${REPROG_MAX} reprogrammations atteinte. Contactez la direction de l'école.`
        )
      }

      // Search starts the day after the current RV
      const cur = parseDDMMYYYY(input.currentDateRV)
      if (!cur) {
        throw new Error('Date de RV actuelle illisible.')
      }
      const start = new Date(cur.getTime())
      start.setDate(start.getDate() + 1)

      const slot = await findNextSlot(start, input.placesParJour)
      if (!slot) {
        throw new Error(
          'Aucun créneau disponible dans les prochains jours. Réessayez plus tard.'
        )
      }

      // Release the old day (best effort, not fatal)
      await releaseSlot(input.currentDateRV)

      // Update the dossier
      await updateDoc(doc(db, preInscriptionDoc(input.inscriptionId)), {
        dateRV: slot.dateDisplay,
        reprogCount: input.currentReprogCount + 1,
      })

      return { dateRV: slot.dateDisplay }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pre-inscriptions'] })
    },
  })
}

// ─── Delete ───────────────────────────────────────────────────

export interface DeleteInscriptionInput {
  inscriptionId: string
  /** If set, also try to release any RV slot the dossier was holding. */
  dateRV?: string
}

export function useDeleteInscription() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: DeleteInscriptionInput) => {
      // Wipe the document subcollection first
      await deleteAllDocsForInscription(input.inscriptionId)

      // Release the RV slot if there was one (best effort)
      if (input.dateRV) {
        await releaseSlot(input.dateRV)
      }

      // Then the inscription itself
      await deleteDoc(doc(db, preInscriptionDoc(input.inscriptionId)))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pre-inscriptions'] })
    },
  })
}

// ─── Finalize (caissier-side) ─────────────────────────────────

export interface FinalizeInscriptionInput {
  inscription: PreInscription
  /** Total amount paid (must equal cible). */
  montant: number
  caissier: string
  /** Optional payment method tag. */
  methode?: string
}

export interface FinalizeInscriptionResult {
  eleveId: string
  codePin: string
  passkeyParent: string
  paiementId: string
}

/**
 * Finalize: promotes pre_inscription → real élève + records paiement
 * + closes dossier + cleans up document subcollection.
 *
 * Order matters: we create the élève FIRST so we have its ID for the
 * paiement, then write the paiement, then close the inscription.
 * If anything fails halfway, the next step won't run — admin sees an
 * error toast and can retry. The wonderful guarantee here is that
 * the élève + paiement go together (paiement is in their subcol),
 * so even on partial success, the data is consistent at the
 * paiement→élève level.
 */
export function useFinalizeInscription() {
  const qc = useQueryClient()

  return useMutation<
    FinalizeInscriptionResult,
    Error,
    FinalizeInscriptionInput
  >({
    mutationFn: async (input) => {
      const { inscription, montant, caissier, methode } = input

      if (!inscription.classeCible) {
        throw new Error("Classe de destination manquante. Approuvez d'abord.")
      }
      if (inscription.statut !== 'Approuvé') {
        throw new Error(
          `Statut actuel "${inscription.statut}" — seul un dossier "Approuvé" peut être finalisé.`
        )
      }
      if (montant <= 0) {
        throw new Error('Le montant doit être positif.')
      }

      // Re-fetch to make sure it's still Approuvé (concurrent change check)
      const fresh = await getDoc(doc(db, preInscriptionDoc(inscription.id)))
      if (!fresh.exists()) throw new Error('Dossier introuvable.')
      const freshData = fresh.data() as PreInscription
      if (freshData.statut !== 'Approuvé') {
        throw new Error(
          `Le dossier a été modifié entretemps (statut "${freshData.statut}").`
        )
      }

      // NEW defensive guard: verify the target class STILL EXISTS before
      // writing the élève. Without this, if a class was deleted or the
      // classeCible was somehow set to a wrong id, the élève would be
      // written to an orphan path (classes/{dead_id}/eleves/{newId}) —
      // it'd exist in Firestore but invisible in every UI because the
      // class doc doesn't exist.
      const targetClasseSnap = await getDoc(
        doc(db, 'classes', inscription.classeCible)
      )
      if (!targetClasseSnap.exists()) {
        throw new Error(
          `La classe cible (${inscription.classeCible}) n'existe plus. Re-approuvez le dossier avec une classe valide.`
        )
      }

      const codePin = genererCodePin()
      const passkeyParent = genererPasskeyParent()

      const elevePayload = {
        nom: (inscription.nom ?? '').trim() || 'Sans nom',
        genre: inscription.genre ?? 'M',
        contactParent: inscription.contactParent ?? '',
        date_naissance: inscription.date_naissance ?? '',
        dateAjout: serverTimestamp(),
        ajoutePar: 'caisse_admission',
        codePin,
        passkeyParent,
      }

      console.info('[finalize] writing élève', {
        classeCible: inscription.classeCible,
        path: elevesCol(inscription.classeCible),
        nom: elevePayload.nom,
      })

      // 1. Create élève
      const newEleveRef = await addDoc(
        collection(db, elevesCol(inscription.classeCible)),
        elevePayload
      )

      console.info('[finalize] élève created', {
        eleveId: newEleveRef.id,
        fullPath: newEleveRef.path,
      })

      // NEW defensive guard: verify the élève actually exists at the
      // expected path before recording the paiement + closing the dossier.
      // Catches the rare Firestore consistency edge case where addDoc
      // returns a ref but the doc isn't yet visible on a read.
      const verifyEleveSnap = await getDoc(newEleveRef)
      if (!verifyEleveSnap.exists()) {
        throw new Error(
          `L'élève n'est pas apparu à l'emplacement attendu. Annulez et réessayez.`
        )
      }

      // 2. Record paiement
      const paiementRef = await addDoc(
        collection(
          db,
          paiementsCol(inscription.classeCible, newEleveRef.id)
        ),
        {
          montant: Math.round(montant),
          date: serverTimestamp(),
          caissier: caissier || 'Administration',
          ...(methode ? { methode } : {}),
          note: 'Première inscription',
        }
      )

      console.info('[finalize] paiement recorded', {
        paiementId: paiementRef.id,
        path: paiementRef.path,
      })

      // 3. Close pre-inscription
      await updateDoc(doc(db, preInscriptionDoc(inscription.id)), {
        statut: 'Inscrit Officiellement',
      })

      // 4. Cleanup documents subcollection (non-blocking)
      void deleteAllDocsForInscription(inscription.id)

      return {
        eleveId: newEleveRef.id,
        codePin,
        passkeyParent,
        paiementId: paiementRef.id,
      }
    },
    onSuccess: (result, vars) => {
      qc.invalidateQueries({ queryKey: ['pre-inscriptions'] })

      if (vars.inscription.classeCible) {
        // The class-scoped élève snapshot listener (useEleves) will
        // pick up the new doc automatically via onSnapshot. Just
        // invalidate so any cached reads of that key pick up the
        // latest view.
        qc.invalidateQueries({
          queryKey: ['eleves', vars.inscription.classeCible],
        })

        // School-wide élève list (useAllEleves) is a one-shot
        // getDocs with a 5-min stale time. We want the new élève
        // to be visible ASAP in the Finances terminal + Bilan.
        //
        // Strategy:
        //
        // 1. Optimistic seed — IF the cache was already populated
        //    (admin has visited Finances this session), append the
        //    new entry to the existing list. The user sees the
        //    student immediately next time they view Finances.
        //
        //    If the cache is empty/undefined (admin went straight
        //    to Guichet without visiting Finances first), DO NOT
        //    seed a single-entry cache — that would trick
        //    useAllEleves into thinking the whole school has just
        //    1 student. Let the refetch below populate it fresh.
        //
        // 2. Force-refetch — actively re-run the getDocs query so
        //    the cache ends up in sync with server state. For cold
        //    cache, this is the primary refresh path.
        const cached = qc.getQueryData<
          Array<{
            id: string
            classeId: string
            nom?: string
            genre?: string
            contactParent?: string
            date_naissance?: string
          }>
        >(['eleves', 'all'])

        // Only seed if the cache was already hydrated. Seeding an
        // empty cache would cause Finances to show ONLY the new
        // student until the async refetch completes.
        if (cached && cached.length > 0) {
          const optimisticEntry = {
            id: result.eleveId,
            classeId: vars.inscription.classeCible,
            nom: vars.inscription.nom ?? 'Sans nom',
            genre: vars.inscription.genre ?? 'M',
            contactParent: vars.inscription.contactParent ?? '',
            date_naissance: vars.inscription.date_naissance ?? '',
          }

          // Dedup guard
          if (!cached.some((e) => e.id === optimisticEntry.id)) {
            const next = [...cached, optimisticEntry].sort((a, b) =>
              (a.nom ?? '').localeCompare(b.nom ?? '')
            )
            qc.setQueryData(['eleves', 'all'], next)
          }
        }

        // Force-refetch. If nothing is subscribed, this creates a
        // short-lived query job that repopulates the cache.
        void qc.refetchQueries({ queryKey: ['eleves', 'all'] })

        // Pre-seed the paiements cache for this new élève so the
        // Terminal de caisse / Bilan show the paiement IMMEDIATELY,
        // without waiting for the snapshot listener to resolve the
        // serverTimestamp. Without this, users see "Aucun paiement"
        // or 0F for ~500ms-1s until the listener fires.
        //
        // We write a synthetic in-memory paiement with `date: new Date()`
        // (client time). The real listener will overwrite this with the
        // server-resolved version when it arrives, so there's no long-
        // term consistency risk.
        const paiementsKey = [
          'paiements',
          vars.inscription.classeCible,
          result.eleveId,
        ]
        qc.setQueryData(paiementsKey, [
          {
            id: result.paiementId,
            montant: Math.round(vars.montant),
            // Duck-typed Timestamp — tsToDate + totalPaiements don't
            // need a real Timestamp; they only call .toDate() / read
            // .montant. The real server-resolved snapshot will overwrite
            // this entry within milliseconds when the listener fires.
            date: { toDate: () => new Date() },
            caissier: vars.caissier || 'Administration',
            note: 'Première inscription',
            ...(vars.methode ? { methode: vars.methode } : {}),
          } as unknown as Paiement,
        ])
      }
      qc.invalidateQueries({ queryKey: ['school-stats'] })
      qc.invalidateQueries({ queryKey: ['finances', 'bilan'] })
    },
  })
}

// ─── Lookup by tracking code (used by guichet + public form) ──

export async function findInscriptionByTrackingCode(
  code: string
): Promise<PreInscription | null> {
  const { collection: col, getDocs, query: q, where } = await import(
    'firebase/firestore'
  )
  const snap = await getDocs(
    q(col(db, preInscriptionsCol()), where('trackingCode', '==', code.trim()))
  )
  if (snap.empty) return null
  const d = snap.docs[0]
  return { id: d.id, ...(d.data() as Omit<PreInscription, 'id'>) }
}
