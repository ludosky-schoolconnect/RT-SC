/**
 * RT-SC · Caissier session store.
 *
 * Holds the optional display-name override for the current caissier.
 * Background: a caissier may be a shift worker who prefers their
 * first name or a nickname on receipts rather than their full
 * Professeur doc name ("Marcel" vs "KPETA Marcel Olivier"). They
 * can override it in the dashboard header; the choice persists
 * across sessions via localStorage.
 *
 * Precedence for the caissier string written on paiements / receipts:
 *   1. Override (if non-empty) from this store
 *   2. profil.nom (the Professeur doc)
 *   3. authUser.displayName / email
 *   4. 'Administration' (last resort)
 *
 * Consumers:
 *   - CaissierDashboard header (read + write)
 *   - GuichetView (finalize flow — read to stamp paiement)
 *   - ModalElevePaiements (admin or caissier add paiement — read)
 *
 * Design decisions:
 *   - Single string, not a full identity object. Anything more complex
 *     should live on the Professeur doc, not in local state.
 *   - Cleared on logout (the AuthProvider does this).
 *   - Never used when the logged-in user is admin (not caissier); the
 *     store returns empty string for admin so the profil.nom fallback
 *     kicks in naturally.
 */

import { create } from 'zustand'

const LS_KEY = 'sc_caissier_display_name'

function loadName(): string {
  try {
    return localStorage.getItem(LS_KEY) ?? ''
  } catch {
    return ''
  }
}

function saveName(name: string) {
  try {
    if (name) localStorage.setItem(LS_KEY, name)
    else localStorage.removeItem(LS_KEY)
  } catch {
    // localStorage unavailable (private browsing, etc.) — no-op
  }
}

interface CaissierState {
  /** Freeform display name override. Empty string = no override. */
  displayName: string
  setDisplayName: (name: string) => void
  clear: () => void
}

export const useCaissier = create<CaissierState>((set) => ({
  displayName: loadName(),
  setDisplayName: (name) => {
    const trimmed = name.trim()
    saveName(trimmed)
    set({ displayName: trimmed })
  },
  clear: () => {
    saveName('')
    set({ displayName: '' })
  },
}))

/**
 * Pick the best caissier name for a paiement or receipt record.
 *
 * Pure helper — can be called from mutations outside React render.
 */
export function resolveCaissierName(args: {
  override?: string
  profilNom?: string | null
  authDisplayName?: string | null
  authEmail?: string | null
}): string {
  const trimmedOverride = (args.override ?? '').trim()
  if (trimmedOverride) return trimmedOverride
  if (args.profilNom && args.profilNom.trim()) return args.profilNom.trim()
  if (args.authDisplayName && args.authDisplayName.trim())
    return args.authDisplayName.trim()
  if (args.authEmail && args.authEmail.trim()) return args.authEmail.trim()
  return 'Administration'
}
