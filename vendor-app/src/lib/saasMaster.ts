/**
 * Vendor · SaaSMaster claim helper.
 *
 * Calls the `setSaaSMasterClaim` Cloud Function on the current
 * school's Firebase project, then force-refreshes the ID token so
 * the new custom claim is immediately visible to Firestore rules.
 *
 * ─── Why this helper exists ──────────────────────────────────
 *
 * Before Session E5, rules identified SaaSMaster via a hardcoded
 * UID per school project. Adding a new school meant logging in
 * once, copying the UID, pasting into firestore.rules, deploying.
 * E5 replaces that with a Firebase Auth custom claim set by the
 * Cloud Function — same code everywhere, no per-school edits.
 *
 * ─── When to call this ───────────────────────────────────────
 *
 * - On every vendor-app login (idempotent — safe to call repeatedly)
 * - After bootstrapping a new school (right after
 *   createUserWithEmailAndPassword, before the first privileged write)
 *
 * ─── Resilience ──────────────────────────────────────────────
 *
 * If the function hasn't been deployed yet to the target school
 * (e.g. school is still on Spark plan or functions weren't deployed
 * before vendor-app login), the callable throws functions/not-found
 * or functions/unavailable. We swallow those so the vendor app stays
 * usable: Ludosky can still log in and fix things. Other errors are
 * surfaced to the caller — the UI decides whether to block or warn.
 */

import type { FirebaseApp } from 'firebase/app'
import { getAuth, type User } from 'firebase/auth'
import { getFunctions, httpsCallable, type FunctionsError } from 'firebase/functions'

interface CallableOutput {
  ok: boolean
  wasAlreadySet: boolean
  uid: string
}

export interface EnsureClaimResult {
  /** True if the claim is confirmed present on the refreshed ID token. */
  claimPresent: boolean
  /** True if the callable was invoked and returned successfully. */
  callableSucceeded: boolean
  /** True if we couldn't reach the callable (function not deployed,
   *  offline, etc). Vendor app can still operate via UID-based rules
   *  as a fallback path when legacy rules are deployed. */
  callableUnavailable: boolean
  /** Human-readable message for logs/toasts when something partial
   *  happens. Null on clean success. */
  message: string | null
}

/**
 * Ensure the signed-in user has the saasMaster custom claim on the
 * current Firebase Auth tenant. Calls the setSaaSMasterClaim Cloud
 * Function and force-refreshes the ID token so rules see the claim
 * on the very next write.
 *
 * @param app    The Firebase app for the current school.
 * @param user   The signed-in Firebase User (as returned from
 *               signInWithEmailAndPassword or createUserWithEmailAndPassword).
 */
export async function ensureSaaSMasterClaim(
  app: FirebaseApp,
  user: User
): Promise<EnsureClaimResult> {
  const functions = getFunctions(app, 'us-central1')

  let callableSucceeded = false
  let callableUnavailable = false
  let callableMessage: string | null = null

  try {
    const call = httpsCallable<Record<string, never>, CallableOutput>(
      functions,
      'setSaaSMasterClaim'
    )
    const res = await call({})
    callableSucceeded = true
    if (res.data.wasAlreadySet) {
      callableMessage = 'claim already present'
    }
  } catch (err) {
    const code = (err as FunctionsError)?.code
    if (
      code === 'functions/not-found' ||
      code === 'functions/unavailable' ||
      code === 'functions/internal'
    ) {
      // Function not deployed yet (pre-Blaze on this school, or
      // functions not yet pushed). Not fatal — proceed with whatever
      // claim state the user already has.
      callableUnavailable = true
      callableMessage =
        'setSaaSMasterClaim non déployé sur cette école — déployez les fonctions pour activer le mode SaaSMaster.'
      console.warn('[saasMaster] callable unavailable:', code)
    } else if (code === 'functions/permission-denied') {
      callableMessage =
        "Ce compte n'est pas autorisé comme SaaSMaster. Vérifiez que vous êtes connecté avec ludoskyazon@gmail.com."
      console.warn('[saasMaster] permission-denied')
    } else if (code === 'functions/failed-precondition') {
      callableMessage =
        'Adresse email non vérifiée. Vérifiez votre email Google puis réessayez.'
      console.warn('[saasMaster] email not verified')
    } else {
      callableMessage =
        'Échec de la promotion SaaSMaster. Certaines actions peuvent être bloquées.'
      console.error('[saasMaster] unexpected callable error:', err)
    }
  }

  // Force-refresh the ID token so newly-set claims propagate
  // immediately. Safe even if the callable failed — the refresh
  // costs a single Auth request and ensures the token is fresh
  // for any other claim changes.
  try {
    await user.getIdToken(true)
  } catch (err) {
    console.warn('[saasMaster] token refresh failed:', err)
  }

  // Read the refreshed claims to confirm presence.
  let claimPresent = false
  try {
    const result = await user.getIdTokenResult()
    claimPresent = result.claims.saasMaster === true
  } catch (err) {
    console.warn('[saasMaster] getIdTokenResult failed:', err)
  }

  return {
    claimPresent,
    callableSucceeded,
    callableUnavailable,
    message: callableMessage,
  }
}

/**
 * Convenience: check whether the current auth token carries the
 * saasMaster claim. Synchronous (uses the cached token result).
 */
export async function hasSaaSMasterClaim(app: FirebaseApp): Promise<boolean> {
  const user = getAuth(app).currentUser
  if (!user) return false
  try {
    const result = await user.getIdTokenResult()
    return result.claims.saasMaster === true
  } catch {
    return false
  }
}
