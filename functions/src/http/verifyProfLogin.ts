/**
 * verifyProfLogin — HTTPS callable for per-prof login passkey verification.
 *
 * Called by the ProfPasskeyGate on the client when a returning prof
 * tries to unlock the login page. Accepts `{ email, passkey }`,
 * looks up the prof doc by email via admin SDK (bypasses rules),
 * compares the candidate passkey to the stored one, and returns a
 * short-lived (12h) HMAC-signed token on success.
 *
 * Rate limited to 5 attempts per IP per 15 min. Excessive failures
 * short-circuit with a `resource-exhausted` code.
 *
 * Security:
 *   - Passkeys are stored in plaintext on /professeurs/{uid}.loginPasskey
 *     because they're short (6 digits) and rotation is cheap. Hashing
 *     would add constant-time compare overhead with no real benefit:
 *     a leaked hash of a 6-digit code is cracked in seconds. We rely
 *     on the rate limiter + rule restricting loginPasskey read to
 *     admin/self.
 *   - Returned token is HMAC-SHA256 signed with HMAC_SECRET, so the
 *     client can't forge one. Payload includes passkeyVersion; when a
 *     prof rotates, the old version is invalidated (any existing
 *     tokens silently fail).
 *   - Lookup is by email exact match. Firestore query needs a single-
 *     field index on `email` which exists by default. If email has
 *     whitespace or mixed case, we normalize client-side (matching
 *     how emails are stored on signup).
 *
 * Client-side flow:
 *   1. User types email + passkey on gate
 *   2. Client calls verifyProfLogin({ email, passkey })
 *   3. On success, client stores returned token + expiresAt in
 *      sessionStorage and renders <ProfAuth /> beneath the gate
 *   4. On 'unauthenticated' error, client shows "Code incorrect"
 *   5. On 'resource-exhausted', client shows "Trop de tentatives,
 *      réessayez dans X minutes"
 *   6. On 'unavailable' or network failure (Blaze not deployed yet),
 *      client falls back to the legacy school-wide passkey check
 *
 * This is Session E — shipped dormant. Activates on Blaze deploy.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import { db } from '../lib/firebase.js'
import {
  HMAC_SECRET,
  signToken,
  checkRateLimit,
  clearRateLimit,
} from '../lib/passkey.js'

interface VerifyInput {
  email?: string
  passkey?: string
}

interface ProfDoc {
  email?: string
  loginPasskey?: string
  /** Version counter bumped on rotation — baked into token payload. */
  loginPasskeyVersion?: number
  statut?: string
  role?: string
}

export const verifyProfLogin = onCall(
  {
    region: 'us-central1',
    secrets: [HMAC_SECRET],
    timeoutSeconds: 30,
    cors: true,
  },
  async (req) => {
    const { email, passkey } = (req.data ?? {}) as VerifyInput

    if (typeof email !== 'string' || typeof passkey !== 'string') {
      throw new HttpsError(
        'invalid-argument',
        'email and passkey are required strings'
      )
    }

    const cleanEmail = email.trim().toLowerCase()
    const cleanPasskey = passkey.trim()

    if (!cleanEmail || !cleanPasskey) {
      throw new HttpsError('invalid-argument', 'email and passkey cannot be empty')
    }

    // Rate limit key: prefer auth uid if present (anon session), else IP.
    // The rawRequest.ip is the load-balancer IP in most Cloud Functions
    // setups — acceptable for our threat model (brake, not wall).
    const rateKey =
      req.auth?.uid ?? req.rawRequest.ip ?? 'unknown'

    const rl = checkRateLimit(rateKey)
    if (!rl.allowed) {
      logger.warn('verifyProfLogin: rate-limited', {
        rateKey,
        retryAfterMs: rl.retryAfterMs,
      })
      throw new HttpsError(
        'resource-exhausted',
        'Trop de tentatives. Réessayez dans quelques minutes.'
      )
    }

    // Look up the prof by email. One query per attempt — cost is 1 read
    // on match, 0 reads on miss (empty snapshot still bills as 1 doc
    // read per Firestore docs, but the query itself is a single round-trip).
    const snap = await db
      .collection('professeurs')
      .where('email', '==', cleanEmail)
      .limit(1)
      .get()

    if (snap.empty) {
      // Generic message so an attacker can't enumerate registered emails
      throw new HttpsError(
        'unauthenticated',
        'Email ou code incorrect.'
      )
    }

    const doc = snap.docs[0]
    const prof = doc.data() as ProfDoc

    // Block en_attente profs from getting tokens — they shouldn't be
    // able to unlock the gate until admin approves them.
    if (prof.statut !== 'actif') {
      throw new HttpsError(
        'permission-denied',
        "Votre compte n'est pas encore activé. Contactez l'administration."
      )
    }

    if (!prof.loginPasskey) {
      // Active prof but no passkey set — migration gap. Admin needs
      // to trigger generation. Fail cleanly.
      logger.warn('verifyProfLogin: no loginPasskey on active prof', {
        profId: doc.id,
      })
      throw new HttpsError(
        'failed-precondition',
        "Aucun code de connexion n'est configuré. Contactez l'administration."
      )
    }

    if (prof.loginPasskey !== cleanPasskey) {
      throw new HttpsError('unauthenticated', 'Email ou code incorrect.')
    }

    // Success — clear the rate counter for this key and issue a token.
    clearRateLimit(rateKey)
    const token = signToken({
      uid: doc.id,
      v: prof.loginPasskeyVersion ?? 1,
    })

    // Stamp lastLoginAt so the inactivity scheduler knows this prof
    // is active. Best-effort — don't fail the login if the write errors.
    try {
      await doc.ref.update({ lastLoginAt: new Date() })
    } catch (err) {
      logger.warn('verifyProfLogin: lastLoginAt update failed (non-fatal)', {
        profId: doc.id,
        err: (err as Error).message,
      })
    }

    logger.info('verifyProfLogin: success', { profId: doc.id })

    return {
      token,
      uid: doc.id,
      expiresAt: Date.now() + 12 * 60 * 60_000,
    }
  }
)
