/**
 * regenerateOwnPasskey — HTTPS callable for a prof to rotate their
 * own login passkey.
 *
 * Requires auth: the caller must be the prof whose passkey is
 * rotating. No one else (not even admin) uses this callable —
 * admin-initiated regeneration goes through a separate admin-only
 * callable added in Session E3.
 *
 * Actions:
 *   1. Generate a fresh 6-digit passkey
 *   2. Write { loginPasskey, loginPasskeyVersion: increment(1) } to
 *      /professeurs/{uid}. Version bump invalidates any existing
 *      HMAC tokens so any active session (other browser, old phone)
 *      stops working immediately — the prof sees themselves logged
 *      out there.
 *   3. Email the new code to the prof's on-file email
 *
 * Rate limit: 3 rotations per 15 min per user. Rotating should be
 * rare; preventing abuse protects the Resend quota.
 *
 * If called by an unauthenticated user, fails with unauthenticated.
 * If caller's uid doesn't correspond to an active prof doc, fails
 * with permission-denied.
 *
 * This is Session E1b. Dormant until Blaze deploy.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from '../lib/firebase.js'
import { generateLoginPasskey } from '../lib/passkey.js'
import { sendEmail, RESEND_API_KEY } from '../lib/email/send.js'
import { renderEmailShell, H1, P, StrongP } from '../lib/email/layout.js'
import { isProbablyValidEmail, escapeHtml } from '../lib/email/format.js'

const WINDOW_MS = 15 * 60_000
const MAX_ATTEMPTS = 3
const rotationAttempts = new Map<string, number[]>()

function checkRotationRate(uid: string): boolean {
  const now = Date.now()
  const list = (rotationAttempts.get(uid) ?? []).filter((t) => now - t < WINDOW_MS)
  if (list.length >= MAX_ATTEMPTS) return false
  list.push(now)
  rotationAttempts.set(uid, list)
  return true
}

interface ProfDoc {
  email?: string
  nom?: string
  statut?: string
  loginPasskeyVersion?: number
}

export const regenerateOwnPasskey = onCall(
  {
    region: 'us-central1',
    secrets: [RESEND_API_KEY],
    timeoutSeconds: 30,
    cors: true,
  },
  async (req) => {
    // Require authentication. The caller must be a prof (not an
    // anon session) so that req.auth.uid corresponds to a real
    // /professeurs/{uid} doc.
    if (!req.auth?.uid) {
      throw new HttpsError(
        'unauthenticated',
        'Vous devez être connecté pour régénérer votre code.'
      )
    }
    const uid = req.auth.uid

    if (!checkRotationRate(uid)) {
      throw new HttpsError(
        'resource-exhausted',
        'Trop de régénérations récentes. Patientez quelques minutes.'
      )
    }

    // Fetch the prof doc via admin SDK
    const snap = await db.doc(`professeurs/${uid}`).get()
    if (!snap.exists) {
      throw new HttpsError('permission-denied', 'Aucun compte professeur associé.')
    }

    const prof = snap.data() as ProfDoc
    if (prof.statut !== 'actif') {
      throw new HttpsError(
        'permission-denied',
        "Votre compte n'est pas actif."
      )
    }

    const newPasskey = generateLoginPasskey()

    try {
      await snap.ref.update({
        loginPasskey: newPasskey,
        loginPasskeyVersion: FieldValue.increment(1),
      })
    } catch (err) {
      logger.error('regenerateOwnPasskey: write failed', {
        uid,
        err: (err as Error).message,
      })
      throw new HttpsError('internal', 'Enregistrement du nouveau code impossible.')
    }

    logger.info('regenerateOwnPasskey: rotated', { uid })

    // Email the new code
    if (isProbablyValidEmail(prof.email)) {
      const nom = prof.nom ?? 'professeur(e)'
      const body = `
        ${H1('Votre nouveau code de connexion')}
        ${P(`Bonjour ${escapeHtml(nom)},`)}
        ${P('Vous avez régénéré votre code de connexion personnel. Voici votre nouveau code :')}
        ${StrongP(`<span style="font-family:monospace;letter-spacing:0.08em;color:#0B2545;background:#F7F1DE;padding:2px 8px;border-radius:4px;">${newPasskey}</span>`)}
        ${P('Toutes vos sessions ouvertes (autre navigateur, autre appareil) ont été déconnectées. Vous devrez entrer ce nouveau code lors de votre prochaine connexion.')}
        ${P("Si vous n'avez pas demandé cette régénération, contactez immédiatement l'administration — un tiers a peut-être accès à votre compte.")}
      `

      const html = renderEmailShell({
        body,
        preheader: `Nouveau code : ${newPasskey}`,
        signature: 'SchoolConnect — Accès sécurisé',
      })

      const text = `Bonjour ${nom},

Vous avez régénéré votre code de connexion personnel.

Nouveau code : ${newPasskey}

Toutes vos autres sessions ouvertes ont été déconnectées.

Si vous n'avez pas demandé cette régénération, contactez l'administration.

— SchoolConnect
`

      try {
        await sendEmail({
          to: prof.email!,
          subject: 'Votre nouveau code de connexion',
          html,
          text,
          tag: 'passkey-self-rotated',
        })
      } catch (err) {
        // Non-fatal. The passkey is already saved; the prof can see
        // it in the callable response. Email is redundancy.
        logger.warn('regenerateOwnPasskey: email send failed (non-fatal)', {
          uid,
          err: (err as Error).message,
        })
      }
    }

    // Return the passkey directly so the client can display it
    // immediately without waiting for email delivery.
    return { ok: true, passkey: newPasskey }
  }
)
