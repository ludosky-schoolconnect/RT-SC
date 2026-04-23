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
 *   2. Send an activation NOTIFICATION email to the prof — but NOT
 *      the passkey itself (see security note below).
 *
 * Idempotency: if the trigger fires twice for the same approval (e.g.
 * admin toggles statut back and forth, or function retries on crash),
 * we only stamp + email once — gated by "no existing loginPasskey".
 *
 * Why we generate on activation instead of on signup:
 *   - En_attente profs don't have login rights yet; giving them a
 *     passkey before activation invites confusion
 *   - Admin approving a prof is the natural moment to hand over
 *     credentials — same ceremony as "welcome to the staff"
 *   - Keeps the signup flow (which runs unauthenticated) free of
 *     side effects on /professeurs writes
 *
 * ─── Session E4 — passkey NOT emailed ─────────────────────────
 *
 * The passkey is shown in the admin's UI (the /ecole/professeurs
 * admin view shows it via the onProfActivated write's subsequent
 * query) but NEVER in the activation email. Reason: schools in the
 * target market frequently have shared Gmail accounts, open phone
 * notifications, and family members with access to each other's
 * devices. A passkey traveling via email is trivially exposed. The
 * admin hands the code over in person or through a private channel
 * they trust. This matches vanilla SchoolConnect's historic flow.
 *
 * Email failure: logged, NOT rethrown. The passkey is already
 * stamped on the doc so the prof can still be told manually by the
 * admin. Retrying forever on a permanent email failure would burn
 * invocations.
 *
 * This is Session E1a, hardened in E4.
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

    // Session E4 — IMPORTANT: the passkey is INTENTIONALLY not included
    // in this email. Threat model: students or family members may have
    // access to a prof's inbox (shared Gmail, open notifications on
    // an unlocked phone, etc.) and could read the code and use it to
    // impersonate the prof at the gate. By keeping the code out of
    // the email, the only way to learn it is through the admin who
    // generated it (it's shown in the admin's UI in the Profs tab).
    //
    // The prof must therefore contact their admin in person (or via
    // a private channel) to get the code. Admins are expected to
    // hand it over face-to-face, one-to-one. This matches vanilla
    // SchoolConnect's historic flow and removes email from the
    // threat surface.
    const body = `
      ${H1('Votre compte est activé')}
      ${P(`Bonjour ${escapeHtml(nom)},`)}
      ${P("L'administration a approuvé votre inscription. Vous pouvez maintenant accéder à votre espace professeur.")}
      ${StrongP("Un code de connexion personnel à 6 chiffres a été généré pour vous. Demandez-le directement à votre administrateur — pour votre sécurité, il n'est pas transmis par email.")}
      ${P("Ce code vous sera demandé à chaque connexion pour déverrouiller la page de login, en plus de votre mot de passe.")}
      ${P("Si vous souhaitez changer ce code plus tard, rendez-vous dans l'onglet « Mon profil » de votre espace.")}
    `

    const html = renderEmailShell({
      body,
      preheader: 'Votre compte professeur est activé. Contactez votre administrateur pour obtenir votre code.',
      cta: loginUrl ? { label: 'Ouvrir mon espace', url: loginUrl } : undefined,
      signature: 'SchoolConnect — Accès sécurisé',
    })

    const text = `Bonjour ${nom},

Votre compte professeur est activé.

Un code de connexion personnel a été généré pour vous. Demandez-le
directement à votre administrateur — pour votre sécurité, il n'est
pas transmis par email.

Ce code vous sera demandé à chaque connexion pour déverrouiller la
page de login, en plus de votre mot de passe.
${loginUrl ? `\nSe connecter : ${loginUrl}\n` : ''}
— SchoolConnect
`

    try {
      await sendEmail({
        to: email!,
        subject: 'Votre compte professeur est activé',
        html,
        text,
        tag: 'prof-activated-notification',
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
