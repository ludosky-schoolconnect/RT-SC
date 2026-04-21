/**
 * RT-SC · Paiements — read + write hooks.
 *
 * Paiements live at /classes/{classeId}/eleves/{eleveId}/paiements/{auto}
 * Each doc = one tranche: { montant, date, caissier, methode?, note? }
 *
 * Read is live (onSnapshot piped into cache). Write is optimistic:
 *   - Add: temp doc rendered immediately, replaced on server ack
 *   - Delete: filtered out optimistically, restored on error
 *
 * The caissier is captured at write time from the admin's displayName
 * or email (falls back to 'Administration').
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
  Timestamp,
} from 'firebase/firestore'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { db } from '@/firebase'
import { paiementsCol } from '@/lib/firestore-keys'
import type { Paiement } from '@/types/models'

const FIVE_MIN = 5 * 60_000

// ─── Read ─────────────────────────────────────────────────────

export function useElevePaiements(
  classeId: string | null | undefined,
  eleveId: string | null | undefined
) {
  const qc = useQueryClient()
  const key = ['paiements', classeId ?? '(null)', eleveId ?? '(null)']

  useEffect(() => {
    if (!classeId || !eleveId) return
    const unsub = onSnapshot(
      query(
        collection(db, paiementsCol(classeId, eleveId)),
        orderBy('date', 'desc')
      ),
      (snap) => {
        const list: Paiement[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Paiement, 'id'>),
        }))
        qc.setQueryData(key, list)
      },
      (err) => console.error('[useElevePaiements] snapshot error:', err)
    )
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classeId, eleveId])

  return useQuery<Paiement[]>({
    queryKey: key,
    queryFn: async () => qc.getQueryData<Paiement[]>(key) ?? [],
    enabled: !!classeId && !!eleveId,
    staleTime: FIVE_MIN,
  })
}

// ─── Write ────────────────────────────────────────────────────

export interface AddPaiementInput {
  classeId: string
  eleveId: string
  montant: number
  caissier: string
  methode?: string
  note?: string
}

export function useAddPaiement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: AddPaiementInput): Promise<{ id: string }> => {
      const ref = await addDoc(
        collection(db, paiementsCol(input.classeId, input.eleveId)),
        {
          montant: Math.round(Number(input.montant) || 0),
          date: serverTimestamp(),
          caissier: input.caissier || 'Administration',
          ...(input.methode ? { methode: input.methode } : {}),
          ...(input.note ? { note: input.note } : {}),
        }
      )
      return { id: ref.id }
    },
    onSuccess: (_, vars) => {
      // onSnapshot will push the new doc in — nothing to do besides
      // invalidate any derived queries
      qc.invalidateQueries({ queryKey: ['finances', 'bilan'] })
      void vars
    },
  })
}

export interface DeletePaiementInput {
  classeId: string
  eleveId: string
  paiementId: string
}

export function useDeletePaiement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: DeletePaiementInput) => {
      await deleteDoc(
        doc(
          db,
          `${paiementsCol(input.classeId, input.eleveId)}/${input.paiementId}`
        )
      )
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finances', 'bilan'] })
    },
  })
}

// ─── Helpers ──────────────────────────────────────────────────

export function totalPaiements(list: Paiement[]): number {
  return list.reduce(
    (sum, p) => sum + (typeof p.montant === 'number' ? p.montant : 0),
    0
  )
}

export function tsToDate(ts: Timestamp | unknown): Date | null {
  if (!ts) return null
  const t = ts as { toDate?: () => Date }
  if (typeof t.toDate === 'function') return t.toDate()
  if (ts instanceof Date) return ts
  return null
}

/** FCFA-formatted with thousands separators.
 *
 * Uses manual grouping with a plain ASCII space instead of the French
 * locale's narrow no-break space (U+202F). Reason: jsPDF's default
 * Helvetica font renders U+202F as a slash-looking glyph ("2/000"
 * instead of "2 000"). Plain ASCII space renders correctly in both
 * HTML and PDF. The visual difference in HTML is negligible.
 */
export function formatFCFA(amount: number): string {
  const n = Math.round(amount)
  const grouped = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return `${n < 0 ? '-' : ''}${grouped} FCFA`
}
