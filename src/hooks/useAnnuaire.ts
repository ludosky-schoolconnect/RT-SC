/**
 * RT-SC · Annuaire des Parents — hooks.
 *
 * Reads:
 *   - useAnnuaire()          — full directory list (filters out
 *                              expired entries client-side)
 *   - useMyAnnuaireEntries() — all entries owned by a given parent
 *                              across all their children
 *
 * Writes:
 *   - useUpsertAnnuaireEntry() — create or update a parent slot
 *   - useDeleteAnnuaireEntry() — remove a slot (parent self + admin)
 *
 * Anti-spam:
 *   - Doc id pattern is "{eleveId}_{slot}" with slot ∈ parent1|parent2.
 *     Each parent slot per student is unique → no duplicate spam.
 *   - Every entry has `expireAt = dateAjout + 365 days`. Expired
 *     entries are FILTERED OUT of the browse view.
 *   - Parents see a renewal banner 30 days before expiry.
 *
 * Cost:
 *   - One full list read per `useAnnuaire()` mount, cached 5 min.
 *   - Typical school: 2 × eleveCount = ~600 docs for 300 students
 *     where every parent opts in. Realistically much lower (opt-in).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { serverNow } from '@/lib/serverTime'
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from 'firebase/firestore'
import { db } from '@/firebase'
import { annuaireParentsCol } from '@/lib/firestore-keys'
import type { AnnuaireParent } from '@/types/models'

const FIVE_MIN = 5 * 60_000
const ONE_YEAR_MS = 365 * 24 * 60_000 * 60

export type ParentSlot = 'parent1' | 'parent2'

export interface AnnuaireParentEntry extends AnnuaireParent {
  /** Computed client-side from expireAt vs now. */
  isExpired: boolean
  /** Days until expiry (negative = already expired) */
  daysUntilExpiry: number
}

function annuaireDocId(eleveId: string, slot: ParentSlot): string {
  return `${eleveId}_${slot}`
}

function enrichEntry(raw: AnnuaireParent): AnnuaireParentEntry {
  const now = Date.now()
  const expireMs =
    raw.expireAt && (raw.expireAt as Timestamp).toMillis
      ? (raw.expireAt as Timestamp).toMillis()
      : 0
  const daysUntilExpiry = Math.round((expireMs - now) / 86_400_000)
  return {
    ...raw,
    isExpired: expireMs > 0 && expireMs < now,
    daysUntilExpiry,
  }
}

// ─── Read: full directory ────────────────────────────────────

export function useAnnuaire() {
  return useQuery<AnnuaireParentEntry[]>({
    queryKey: ['annuaire', 'all'],
    staleTime: FIVE_MIN,
    queryFn: async () => {
      const snap = await getDocs(collection(db, annuaireParentsCol()))
      const list: AnnuaireParentEntry[] = []
      for (const d of snap.docs) {
        const raw = { id: d.id, ...(d.data() as Omit<AnnuaireParent, 'id'>) }
        const enriched = enrichEntry(raw)
        if (!enriched.isExpired) list.push(enriched)
      }
      // Alphabetical by nom
      list.sort((a, b) => (a.nom ?? '').localeCompare(b.nom ?? '', 'fr'))
      return list
    },
  })
}

// ─── Read: one parent's entries (by eleveIds they're linked to) ─

export function useMyAnnuaireEntries(eleveIds: string[]) {
  return useQuery<AnnuaireParentEntry[]>({
    queryKey: ['annuaire', 'mine', [...eleveIds].sort()],
    enabled: eleveIds.length > 0,
    staleTime: FIVE_MIN,
    queryFn: async () => {
      if (eleveIds.length === 0) return []
      // Parent slot IDs the current parent could have written to.
      // Two slots × eleveIds = 2n possible docs. We fetch the whole
      // collection and filter (collection is small), rather than
      // one doc-by-doc getDoc per possible id.
      const snap = await getDocs(
        query(
          collection(db, annuaireParentsCol()),
          where('eleveId', 'in', eleveIds.slice(0, 10)) // Firestore 'in' cap
        )
      )
      const list: AnnuaireParentEntry[] = []
      for (const d of snap.docs) {
        const raw = { id: d.id, ...(d.data() as Omit<AnnuaireParent, 'id'>) }
        list.push(enrichEntry(raw))
      }
      return list
    },
  })
}

// ─── Write: create/update ────────────────────────────────────

export interface UpsertInput {
  eleveId: string
  classeId: string
  slot: ParentSlot
  nom: string
  profession: string
  entreprise?: string
  tel: string
}

export function useUpsertAnnuaireEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpsertInput) => {
      const id = annuaireDocId(input.eleveId, input.slot)
      const now = serverNow()
      const expireAt = new Date(now.getTime() + ONE_YEAR_MS)
      await setDoc(
        doc(db, annuaireParentsCol(), id),
        {
          nom: input.nom.trim(),
          profession: input.profession.trim(),
          entreprise: input.entreprise?.trim() || '',
          tel: normalizeTel(input.tel),
          classeId: input.classeId,
          eleveId: input.eleveId,
          dateAjout: serverTimestamp() as unknown as Timestamp,
          expireAt: Timestamp.fromDate(expireAt),
        } satisfies Omit<AnnuaireParent, 'id'>,
        { merge: false } // full replace — each update refreshes expiry
      )
      return id
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['annuaire'] })
    },
  })
}

export function useDeleteAnnuaireEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await deleteDoc(doc(db, annuaireParentsCol(), id))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['annuaire'] })
    },
  })
}

// ─── Validation helpers ──────────────────────────────────────

/**
 * Benin phone format (post-ARCEP reform of 30 November 2024).
 *
 * Since that date, Benin uses a closed 10-digit national format:
 * every mobile/landline number now starts with "01", followed by
 * the original 8-digit subscriber number.
 * Example: old 97 00 00 00 → new 01 97 00 00 00.
 *
 * With the country code: +229 01 97 00 00 00 → stored as 13 digits
 * "2290197000000".
 *
 * The editor input is locked to +229 as a fixed prefix so users only
 * type the 10 local digits. This function still gracefully handles:
 *   1. Strip non-digits
 *   2. Strip leading "00" (international prefix paste)
 *   3. Strip leading "229" (country code paste)
 *   4. Strip leading "+" (E.164 paste)
 *   5. If result is 8 digits (legacy input), prepend "01" so we
 *      migrate the parent's input to the new format automatically
 *   6. Prepend "229" (country code) → final 13-digit E.164 string
 *
 * Cap at 15 digits total (ITU-T E.164 global max) as safety.
 */
const BENIN_CC = '229'
const LOCAL_LEN = 10

export function normalizeTel(input: string): string {
  let digits = input.replace(/\D/g, '').replace(/^00/, '')
  // Strip leading country code if the user pasted a full +229 number
  if (digits.startsWith(BENIN_CC)) {
    digits = digits.slice(BENIN_CC.length)
  }
  // Legacy 8-digit input (pre-2024) — auto-upgrade to new format
  if (digits.length === 8) {
    digits = '01' + digits
  }
  // Prepend country code for storage in E.164 form
  if (digits.length === LOCAL_LEN) {
    digits = BENIN_CC + digits
  }
  // Safety cap — E.164 max
  if (digits.length > 15) digits = digits.slice(0, 15)
  return digits
}

/**
 * Valid Benin phone after normalization:
 *   - Exactly 13 digits (229 + 10-digit local)
 *   - Local portion must start with "01" per ARCEP rule
 */
export function isValidTel(input: string): boolean {
  const digits = normalizeTel(input)
  if (digits.length !== BENIN_CC.length + LOCAL_LEN) return false
  if (!digits.startsWith(BENIN_CC + '01')) return false
  return true
}

/**
 * Accepts raw local input (what the user has typed so far, without
 * the +229 prefix) and tells us if it's a complete, valid 10-digit
 * Benin number starting with "01".
 */
export function isValidLocalTel(localInput: string): boolean {
  const digits = localInput.replace(/\D/g, '')
  return digits.length === LOCAL_LEN && digits.startsWith('01')
}

/**
 * Human-readable format for display:
 *   "+229 01 97 00 00 00"
 * Falls back to raw digits prefixed with "+" if the number isn't
 * a Benin-shaped value (shouldn't happen after normalization).
 */
export function formatTelDisplay(input: string): string {
  const digits = normalizeTel(input)
  if (
    digits.length === BENIN_CC.length + LOCAL_LEN &&
    digits.startsWith(BENIN_CC)
  ) {
    const local = digits.slice(BENIN_CC.length)
    // 10-digit local → 01 XX XX XX XX
    return `+229 ${local.slice(0, 2)} ${local.slice(2, 4)} ${local.slice(4, 6)} ${local.slice(6, 8)} ${local.slice(8, 10)}`
  }
  return '+' + digits.replace(/(\d{3})(?=\d)/g, '$1 ').trim()
}

/**
 * Given a stored 13-digit number (229XXXXXXXXXX), return just the
 * 10-digit local portion for pre-filling the editor when the user
 * opens their existing entry.
 */
export function extractLocalTel(stored: string): string {
  const digits = stored.replace(/\D/g, '')
  if (digits.startsWith(BENIN_CC)) return digits.slice(BENIN_CC.length)
  return digits
}
