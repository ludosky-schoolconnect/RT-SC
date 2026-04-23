/**
 * onProfActivated trigger.
 *
 * Fires on /professeurs/{uid} UPDATE when `statut` transitions from
 * 'en_attente' to 'actif'. That transition is written by the admin
 * when they approve a pending signup in ProfsTab.
 *
 * Responsibilities:
 *   1. Generate a fresh 6-digit loginPasskey and stamp it on the doc
 *      (alongside loginPasskeyVersion: 1 for first-time).
 *   2. Email the prof their passkey via the existing Resend pipeline.
 *      Subject, body in French. Tells them to save it — they'll need
 *      it every time they return to the login page.
 *
 * Idempotency: if the trigger fires twice for the same approval (e.g.
 * admin toggles statut back and forth, or function retries on crash),
 * we only stamp + email once — gated by "no existing loginPasskey".
 * Subsequent fires see a passkey already exists and skip. To force
 * regeneration, admin uses the regenerateOwnPasskey callable (Session
 * E2) or the upcoming admin regenerate-for-prof surface.
 *
 * Why we generate on activation instead of on signup:
 *   - En_attente profs don't have login rights yet; giving them a
 *     passkey before activation invites confusion
 *   - Admin approving a prof is the natural moment to hand over
 *     credentials — same ceremony as "welcome to the staff"
 *   - Keeps the signup flow (which runs unauthenticated) free of
 *     side effects on /professeurs writes
 *
 * Email failure: logged, NOT rethrown. The passkey is already
 * stamped on the doc so the prof can still be told manually by the
 * admin. Retrying forever on a permanent email failure (bounce, spam
 * filter) would burn invocations.
 *
 * This is Session E1a. Dormant until Blaze deploy.
 */

import { onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { logger } from 'firebase-functions/v2'
import { db } from '../lib/firebase.js'
import { generateLoginPasskey } from '../lib/passkey.js'
import { sendEmail, RESEND_API_KEY } from '../lib/email/send.js'
import { renderEmailShell, H1, P, StrongP } from '../lib/email/layout.js'
import { isProbablyValidEmail, escapeHtml } from '../lib/email/format.js'

interface ProfDoc {
  email?: string
  nom?: string
  statut?: string
  role?: string
  loginPasskey?: string
  loginPasskeyVersion?: number
}

export const onProfActivated = onDocumentUpdated(
  {
    document: 'professeurs/{uid}',
    region: 'us-central1',
    secrets: [RESEND_API_KEY],
    timeoutSeconds: 60,
  },
  async (event) => {
    const before = event.data?.before.data() as ProfDoc | undefined
    const after = event.data?.after.data() as ProfDoc | undefined
    const uid = event.params.uid

    if (!before || !after) return

    // Only interested in the en_attente → actif transition
    const wasEnAttente = before.statut === 'en_attente'
    const isNowActif = after.statut === 'actif'
    if (!wasEnAttente || !isNowActif) return

    // Idempotency — if a passkey already exists, don't regenerate it
    if (after.loginPasskey) {
      logger.info('onProfActivated: loginPasskey already present, skip', { uid })
      return
    }

    const passkey = generateLoginPasskey()

    // Stamp the passkey first. If this write fails, we don't want to
    // have sent the email with a code the prof can never use.
    try {
      await db.doc(`professeurs/${uid}`).update({
        loginPasskey: passkey,
        loginPasskeyVersion: 1,
      })
    } catch (err) {
      logger.error('onProfActivated: failed to stamp loginPasskey', {
        uid,
        err: (err as Error).message,
      })
      throw err // rethrow — retry worth attempting, the write might succeed
    }

    logger.info('onProfActivated: loginPasskey generated', { uid })

    // Best-effort email delivery
    const email = after.email
    const nom = after.nom ?? 'professeur(e)'
    if (!isProbablyValidEmail(email)) {
      logger.warn('onProfActivated: no valid email, skipping send', { uid, email })
      return
    }

    const appUrl = process.env.SCHOOL_APP_URL ?? ''
    const loginUrl = appUrl ? `${appUrl}/prof` : undefined

    const body = `
      ${H1('Votre compte est activé')}
      ${P(`Bonjour ${escapeHtml(nom)},`)}
      ${P("L'administration a approuvé votre inscription. Vous pouvez maintenant accéder à votre espace professeur.")}
      ${StrongP(`Votre code de connexion personnel : <span style="font-family:monospace;letter-spacing:0.08em;color:#0B2545;background:#F7F1DE;padding:2px 8px;border-radius:4px;">${passkey}</span>`)}
      ${P('Conservez ce code. Vous en aurez besoin à chaque connexion pour déverrouiller la page de login, en plus de votre mot de passe.')}
      ${P("Si vous souhaitez changer ce code plus tard, rendez-vous dans l'onglet « Mon profil » de votre espace.")}
    `

    const html = renderEmailShell({
      body,
      preheader: `Votre code de connexion : ${passkey}`,
      cta: loginUrl ? { label: 'Ouvrir mon espace', url: loginUrl } : undefined,
      signature: 'SchoolConnect — Accès sécurisé',
    })

    const text = `Bonjour ${nom},

Votre compte professeur est activé.

Votre code de connexion personnel : ${passkey}

Conservez-le : il sera demandé à chaque connexion pour déverrouiller la page de login.

${loginUrl ? `Se connecter : ${loginUrl}\n` : ''}
— SchoolConnect
`

    try {
      await sendEmail({
        to: email!,
        subject: 'Votre compte professeur est activé',
        html,
        text,
        tag: 'prof-activated-passkey',
      })
    } catch (err) {
      logger.error('onProfActivated: email send failed (non-fatal)', {
        uid,
        err: (err as Error).message,
      })
      // Don't rethrow — passkey is already saved
    }
  }
)
