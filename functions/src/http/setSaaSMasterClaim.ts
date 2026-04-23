/**
 * setSaaSMasterClaim — HTTPS callable.
 *
 * Promotes a signed-in user to SaaSMaster by setting a custom claim
 * `{ saasMaster: true }` on their Firebase Auth user. The custom
 * claim is then carried on every `request.auth.token` and checked
 * by Firestore rules' `isSaaSMaster()` helper.
 *
 * ─── Why this exists ─────────────────────────────────────────
 *
 * Before Session E5, SaaSMaster identity was encoded in rules as a
 * hardcoded UID literal. Firebase Auth assigns a different UID per
 * project, so adding a new school required logging in once to mint
 * the UID, copying it from the Auth dashboard, pasting into
 * firestore.rules, and deploying. Custom claims solve it: the claim
 * is per-user per-project, set by this callable, and rules uniformly
 * check `request.auth.token.saasMaster == true` across every project.
 *
 * ─── Authorization (env-driven, not hardcoded) ───────────────
 *
 * Only callers matching BOTH of the following can upgrade themselves:
 *   - request.auth.token.email is in SAAS_MASTER_EMAILS (env var)
 *   - request.auth.token.email_verified == true
 *
 * The allowlist is read from the `SAAS_MASTER_EMAILS` environment
 * variable, comma-separated. Each school's `functions/.env.<pid>`
 * file declares which email(s) are allowed to be SaaSMaster in THAT
 * school. In practice you'll use your ops email (same across all
 * schools) but the env-driven design means:
 *   - Different schools can have different master emails (for handoff)
 *   - Rotating the master email for one school = edit .env + redeploy,
 *     no code change
 *   - No email is baked into the compiled JS
 *
 * If `SAAS_MASTER_EMAILS` is unset or empty, ALL callers are rejected
 * (fail-safe). Forgetting to set the env var is safer than the
 * alternative — you'll notice immediately when the vendor-app login
 * returns permission-denied, and can fix with one env edit.
 *
 * ─── Idempotency ─────────────────────────────────────────────
 *
 * Safe to call multiple times. If the claim is already set, no-ops
 * with a cheap read + no write. Safe to call on every vendor-app
 * login.
 *
 * ─── Front-end requirement ───────────────────────────────────
 *
 * Custom claims only propagate to `request.auth.token` on the NEXT
 * ID-token refresh. The caller must invoke `user.getIdToken(true)`
 * after a successful callable response; otherwise rules will still
 * see the old token without the claim. Vendor-app handles this.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import { getAuth } from 'firebase-admin/auth'
// Importing anything from lib/firebase.js triggers firebase-admin
// initialization before getAuth() is called. Standard pattern used
// by every other function in this codebase.
import { db } from '../lib/firebase.js'

// Silence unused-variable warning — the import is for its side effect.
void db

/**
 * Parse the comma-separated SAAS_MASTER_EMAILS env var at call time.
 * Reading at call time (not module-load time) means an env update +
 * function restart picks up changes without redeploy.
 */
function getAllowedEmails(): Set<string> {
  const raw = process.env.SAAS_MASTER_EMAILS ?? ''
  return new Set(
    raw
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0)
  )
}

interface CallableOutput {
  ok: boolean
  /** Whether the claim was newly set (true) or already present (false). */
  wasAlreadySet: boolean
  /** Echo of the caller's uid so clients can verify consistency. */
  uid: string
}

export const setSaaSMasterClaim = onCall(
  {
    region: 'us-central1',
    timeoutSeconds: 30,
    cors: true,
  },
  async (req): Promise<CallableOutput> => {
    if (!req.auth?.uid) {
      throw new HttpsError(
        'unauthenticated',
        'Vous devez être connecté pour obtenir ce droit.'
      )
    }

    const uid = req.auth.uid
    const token = req.auth.token
    const email = typeof token.email === 'string' ? token.email.toLowerCase() : ''
    const emailVerified = token.email_verified === true

    const allowedEmails = getAllowedEmails()

    // Fail-safe: if no emails are configured, REJECT all callers.
    // Better to fail visibly than silently promote a random user.
    if (allowedEmails.size === 0) {
      logger.error('setSaaSMasterClaim: SAAS_MASTER_EMAILS env var is empty or unset', {
        uid,
        email,
      })
      throw new HttpsError(
        'failed-precondition',
        "Configuration du serveur incomplète. Contactez le support technique."
      )
    }

    if (!allowedEmails.has(email)) {
      logger.warn('setSaaSMasterClaim: denied (email not on allowlist)', {
        uid,
        email,
        allowedCount: allowedEmails.size,
      })
      throw new HttpsError('permission-denied', "Votre compte n'est pas autorisé.")
    }

    if (!emailVerified) {
      logger.warn('setSaaSMasterClaim: denied (email not verified)', { uid, email })
      throw new HttpsError(
        'failed-precondition',
        'Votre adresse email doit être vérifiée. Vérifiez votre boîte de réception et réessayez.'
      )
    }

    try {
      const auth = getAuth()
      const user = await auth.getUser(uid)
      const currentClaims = user.customClaims ?? {}
      const wasAlreadySet = currentClaims.saasMaster === true

      if (wasAlreadySet) {
        logger.info('setSaaSMasterClaim: claim already present (no-op)', { uid })
        return { ok: true, wasAlreadySet: true, uid }
      }

      // Preserve any other claims (future-proofing). Merge rather than replace.
      await auth.setCustomUserClaims(uid, {
        ...currentClaims,
        saasMaster: true,
      })

      logger.info('setSaaSMasterClaim: claim set', { uid, email })
      return { ok: true, wasAlreadySet: false, uid }
    } catch (err) {
      logger.error('setSaaSMasterClaim: failed', {
        uid,
        err: (err as Error).message,
      })
      throw new HttpsError('internal', 'Impossible de définir le droit SaaSMaster.')
    }
  }
)
