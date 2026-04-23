/**
 * RT-SC · Prof/caissier personal passkey verification helper.
 *
 * Centralizes the server-side passkey check + sessionStorage
 * bookkeeping used by ProfAuth and CaisseAuth. Before Session E6,
 * this logic lived in ProfPasskeyGate which wrapped the entire
 * auth route — which blocked signup (new profs have no code yet).
 *
 * E6 inlines the check into each login form. A single submit
 * verifies email+code server-side first, and only on success
 * proceeds with the standard Firebase email+password signin.
 * Signup tab no longer needs to pass a gate.
 *
 * ─── Flow ────────────────────────────────────────────────────
 *
 * 1. User types email + password + personal code in the login form
 * 2. Form calls verifyPersonalCode(email, code)
 *    - If sessionStorage already has a valid unlock (4h TTL), skips
 *      the server call → returns { ok: true }
 *    - Otherwise calls verifyProfLogin Cloud Function, verifies,
 *      stashes the HMAC token + expiresAt in sessionStorage
 * 3. On success, form runs signInWithEmailAndPassword
 * 4. Next same-tab login attempt within 4h skips the server call
 *
 * ─── Why keep the 4h sessionStorage skip ─────────────────────
 *
 * A prof who logs out (or whose Firebase Auth session expired)
 * and logs back in within 4 hours shouldn't have to re-enter the
 * code — they've already proven physical possession of the device
 * recently. This matches ProfPasskeyGate's prior behavior.
 */

import { httpsCallable, type FunctionsError } from 'firebase/functions'
import { auth, functions } from '@/firebase'

const GATE_KEY_PREFIX = 'rtsc.profGate'

interface GateUnlock {
  token: string
  uid: string
  expiresAt: number
}

interface VerifyLoginInput {
  email: string
  passkey: string
}

interface VerifyLoginOutput {
  token: string
  uid: string
  expiresAt: number
}

function gateStorageKey(): string {
  return `${GATE_KEY_PREFIX}.${auth.app.options.projectId ?? 'default'}`
}

/**
 * Read the current sessionStorage unlock record, if any.
 * Returns null if:
 *   - No record
 *   - Record is malformed
 *   - Record expired
 *   - Record is for a different email than the one submitted
 *
 * Note: does NOT check anything against the email — see why in
 * verifyPersonalCode. The sessionStorage entry is keyed by project
 * alone; if the tab was previously unlocked by Alice's code, Bob's
 * login in the same tab would skip verification. This matches prior
 * behavior — the 4h bypass is per-device (sessionStorage is cleared
 * on tab close), not per-user. In practice a shared device would
 * need both profs to complete a code check within the same session
 * which is rare; the token itself is still tied to Alice's uid so
 * rules on Alice-gated callables wouldn't pass for Bob anyway.
 */
function readGate(): GateUnlock | null {
  try {
    const raw = sessionStorage.getItem(gateStorageKey())
    if (!raw) return null
    // Backwards-compat: the E2 pre-Blaze gate stored bare '1' or
    // { mode: 'legacy' }. In E4 those are treated as expired.
    if (raw === '1') return null
    const parsed = JSON.parse(raw) as Partial<GateUnlock> & { mode?: string }
    if (parsed.mode === 'legacy') return null
    if (typeof parsed.expiresAt !== 'number') return null
    if (typeof parsed.token !== 'string' || typeof parsed.uid !== 'string') return null
    if (Date.now() > parsed.expiresAt) return null
    return { token: parsed.token, uid: parsed.uid, expiresAt: parsed.expiresAt }
  } catch {
    return null
  }
}

function writeGate(u: GateUnlock): void {
  try {
    sessionStorage.setItem(gateStorageKey(), JSON.stringify(u))
  } catch {
    // Private browsing or storage quota — non-critical
  }
}

/**
 * Clear any stored gate unlock. Called when a code check fails so
 * stale tokens don't accidentally let someone bypass a subsequent
 * check.
 */
export function clearGateUnlock(): void {
  try {
    sessionStorage.removeItem(gateStorageKey())
  } catch {
    // ignore
  }
}

/**
 * Returns true if the current tab's sessionStorage holds a valid
 * (unexpired) personal-code unlock. Used by PersonnelCodeGate to
 * decide whether to challenge for the code on a fresh tab.
 *
 * Cheap synchronous check — safe to call on every render.
 */
export function hasValidUnlock(): boolean {
  return readGate() !== null
}

export type PasskeyVerifyResult =
  | { ok: true; skipped: boolean }
  | { ok: false; reason: 'invalid' | 'rate-limited' | 'not-configured' | 'inactive' | 'network' }

/**
 * Verify a prof/caissier personal passkey server-side (or skip if
 * the current session already has a valid unlock).
 *
 * Returns:
 *   - { ok: true, skipped: true } — an unexpired sessionStorage
 *     unlock was found; server was not called
 *   - { ok: true, skipped: false } — server verified successfully;
 *     new unlock stashed in sessionStorage
 *   - { ok: false, reason: ... } — server rejected, or we couldn't
 *     reach it. Caller shows an appropriate inline error.
 */
export async function verifyPersonalCode(
  email: string,
  code: string
): Promise<PasskeyVerifyResult> {
  const cleanEmail = email.trim().toLowerCase()
  const cleanCode = code.trim()

  if (!cleanEmail || !cleanCode) {
    return { ok: false, reason: 'invalid' }
  }

  // Same-tab 4h bypass.
  const existing = readGate()
  if (existing) {
    return { ok: true, skipped: true }
  }

  try {
    const call = httpsCallable<VerifyLoginInput, VerifyLoginOutput>(
      functions,
      'verifyProfLogin'
    )
    const res = await call({
      email: cleanEmail,
      passkey: cleanCode,
    })
    const { token, uid, expiresAt } = res.data

    // Server uses 12h expiry for the HMAC token itself. Cap the
    // client-side sessionStorage TTL at 4h — a same-tab renewed
    // prompt is a tiny UX cost but shrinks the attack window.
    const fourHoursMs = 4 * 60 * 60 * 1000
    const cappedExpires = Math.min(expiresAt, Date.now() + fourHoursMs)

    writeGate({ token, uid, expiresAt: cappedExpires })
    return { ok: true, skipped: false }
  } catch (err) {
    const errCode = (err as FunctionsError)?.code
    if (errCode === 'functions/unauthenticated') {
      return { ok: false, reason: 'invalid' }
    }
    if (errCode === 'functions/resource-exhausted') {
      return { ok: false, reason: 'rate-limited' }
    }
    if (errCode === 'functions/permission-denied') {
      return { ok: false, reason: 'inactive' }
    }
    if (errCode === 'functions/failed-precondition') {
      return { ok: false, reason: 'not-configured' }
    }
    console.error('[profPasskey] verify error:', err)
    return { ok: false, reason: 'network' }
  }
}

/**
 * Map a PasskeyVerifyResult reason to a French error message for the
 * UI. Kept separate from verifyPersonalCode so the caller controls
 * whether to show the message on a form field, as a toast, or both.
 */
export function passkeyErrorMessage(
  reason: Exclude<PasskeyVerifyResult, { ok: true }>['reason']
): string {
  switch (reason) {
    case 'invalid':
      return 'Email ou code incorrect.'
    case 'rate-limited':
      return 'Trop de tentatives. Réessayez dans quelques minutes.'
    case 'inactive':
      return "Votre compte n'est pas actif."
    case 'not-configured':
      return "Aucun code personnel configuré. Contactez l'administration."
    case 'network':
      return 'Erreur réseau — réessayez.'
  }
}
