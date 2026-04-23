/**
 * regeneratePasskeyForProf — admin-only HTTPS callable.
 *
 * Generates (or re-generates) a loginPasskey for a specific prof and
 * emails them. Used by:
 *
 *   1. The admin "Générer les codes manquants" migration button,
 *      which iterates active profs lacking a loginPasskey and
 *      calls this for each.
 *   2. Manual admin interventions — "prof lost their phone, send
 *      them a fresh code" — via a future per-prof UI (not shipped in
 *      E3 but architected here).
 *
 * This is admin-only. Unlike regenerateOwnPasskey (where a prof
 * rotates their own code), this lets an admin rotate someone ELSE's
 * code. Authorization check reads the caller's /professeurs/{uid}
 * doc and verifies role === 'admin'.
 *
 * Effects (identical to onProfActivated's body):
 *   1. Generate a fresh 6-digit passkey
 *   2. Update /professeurs/{profId}:
 *        { loginPasskey: <new>, loginPasskeyVersion: increment(1) }
 *      (The version bump invalidates any HMAC tokens the prof had.)
 *   3. Email the prof their new code via Resend
 *
 * Idempotent: re-running yields a freshly generated code each time.
 * Admins who click the migration button twice will issue two codes
 * (each superseding the previous). Harmless — emails arrive in
 * order, only the latest one is valid.
 *
 * Rate limit: 20 per admin per 15 min. Enough for a 1-click
 * migration button hitting ~10-15 pending profs; blocks runaway
 * loops.
 *
 * This is Session E3. Dormant until Blaze deploy.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from '../lib/firebase.js'
import { generateLoginPasskey } from '../lib/passkey.js'
import { sendEmail, RESEND_API_KEY } from '../lib/email/send.js'
import { renderEmailShell, H1, P, StrongP } from '../lib/email/layout.js'
import { isProbablyValidEmail, escapeHtml } from '../lib/email/format.js'

interface Input {
  profId: string
}

interface Output {
  ok: boolean
  profId: string
  /** Returned so an admin running the migration sees the generated
   *  code in the UI as confirmation (before the prof receives the
   *  email). DO NOT display to end users other than the admin. */
  passkey: string
  /** Whether the prof doc was already set (useful for migration
   *  button progress tracking — "N profs already had codes, K got
   *  new ones"). */
  wasAlreadySet: boolean
}

interface ProfDoc {
  email?: string
  nom?: string
  statut?: string
  role?: string
  loginPasskey?: string
}

interface CallerDoc {
  role?: string
  statut?: string
}

const WINDOW_MS = 15 * 60_000
const MAX_ATTEMPTS = 20
const adminAttempts = new Map<string, number[]>()

function checkRate(uid: string): boolean {
  const now = Date.now()
  const list = (adminAttempts.get(uid) ?? []).filter((t) => now - t < WINDOW_MS)
  if (list.length >= MAX_ATTEMPTS) return false
  list.push(now)
  adminAttempts.set(uid, list)
  return true
}

export const regeneratePasskeyForProf = onCall(
  {
    region: 'us-central1',
    secrets: [RESEND_API_KEY],
    timeoutSeconds: 30,
    cors: true,
  },
  async (req) => {
    // ─── Auth + admin role check ────────────────────────────
    if (!req.auth?.uid) {
      throw new HttpsError(
        'unauthenticated',
        'Vous devez être connecté en tant qu\'administrateur.'
      )
    }
    const callerUid = req.auth.uid

    if (!checkRate(callerUid)) {
      throw new HttpsError(
        'resource-exhausted',
        'Trop de régénérations récentes. Patientez quelques minutes.'
      )
    }

    const callerSnap = await db.doc(`professeurs/${callerUid}`).get()
    if (!callerSnap.exists) {
      throw new HttpsError('permission-denied', 'Compte introuvable.')
    }
    const caller = callerSnap.data() as CallerDoc
    if (caller.role !== 'admin' || caller.statut !== 'actif') {
      throw new HttpsError(
        'permission-denied',
        'Action réservée aux administrateurs actifs.'
      )
    }

    // ─── Input validation ───────────────────────────────────
    const { profId } = (req.data ?? {}) as Input
    if (typeof profId !== 'string' || !profId.trim()) {
      throw new HttpsError('invalid-argument', 'profId is required')
    }

    // ─── Target prof lookup ─────────────────────────────────
    const targetRef = db.doc(`professeurs/${profId}`)
    const targetSnap = await targetRef.get()
    if (!targetSnap.exists) {
      throw new HttpsError('not-found', 'Professeur introuvable.')
    }
    const prof = targetSnap.data() as ProfDoc
    if (prof.statut !== 'actif') {
      throw new HttpsError(
        'failed-precondition',
        "Le compte n'est pas actif — activez-le d'abord."
      )
    }

    const wasAlreadySet = !!prof.loginPasskey
    const newPasskey = generateLoginPasskey()

    // ─── Write ──────────────────────────────────────────────
    try {
      await targetRef.update({
        loginPasskey: newPasskey,
        loginPasskeyVersion: FieldValue.increment(1),
      })
    } catch (err) {
      logger.error('regeneratePasskeyForProf: write failed', {
        profId,
        err: (err as Error).message,
      })
      throw new HttpsError('internal', 'Enregistrement impossible.')
    }

    logger.info('regeneratePasskeyForProf: rotated', {
      profId,
      adminUid: callerUid,
      wasAlreadySet,
    })

    // ─── Email (best effort) ────────────────────────────────
    if (isProbablyValidEmail(prof.email)) {
      const nom = prof.nom ?? 'professeur(e)'
      const appUrl = process.env.SCHOOL_APP_URL ?? ''
      const loginUrl = appUrl ? `${appUrl}/prof` : undefined

      const body = `
        ${H1(wasAlreadySet ? 'Votre code de connexion a été régénéré' : 'Votre code de connexion est prêt')}
        ${P(`Bonjour ${escapeHtml(nom)},`)}
        ${P(`L'administration ${wasAlreadySet ? 'a régénéré' : 'vous a généré'} votre code de connexion personnel. Voici votre code :`)}
        ${StrongP(`<span style="font-family:monospace;letter-spacing:0.08em;color:#0B2545;background:#F7F1DE;padding:2px 8px;border-radius:4px;">${newPasskey}</span>`)}
        ${P('Conservez ce code. Il vous sera demandé à chaque connexion pour déverrouiller la page de login, en plus de votre mot de passe.')}
        ${wasAlreadySet ? P('Toutes vos sessions ouvertes avec l\'ancien code ont été déconnectées.') : ''}
      `

      const html = renderEmailShell({
        body,
        preheader: `Votre code : ${newPasskey}`,
        cta: loginUrl ? { label: 'Ouvrir mon espace', url: loginUrl } : undefined,
        signature: 'SchoolConnect — Accès sécurisé',
      })

      const text = `Bonjour ${nom},

L'administration ${wasAlreadySet ? 'a régénéré' : 'vous a généré'} votre code de connexion personnel.

Code : ${newPasskey}

Conservez-le : demandé à chaque connexion pour déverrouiller la page de login.
${loginUrl ? `\nSe connecter : ${loginUrl}\n` : ''}

— SchoolConnect
`

      try {
        await sendEmail({
          to: prof.email!,
          subject: wasAlreadySet
            ? 'Votre code de connexion a été régénéré'
            : 'Votre code de connexion est prêt',
          html,
          text,
          tag: 'passkey-admin-regenerated',
        })
      } catch (err) {
        logger.warn('regeneratePasskeyForProf: email send failed (non-fatal)', {
          profId,
          err: (err as Error).message,
        })
      }
    }

    const result: Output = {
      ok: true,
      profId,
      passkey: newPasskey,
      wasAlreadySet,
    }
    return result
  }
)
