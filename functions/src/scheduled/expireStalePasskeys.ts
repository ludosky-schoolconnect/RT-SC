/**
 * expireStalePasskeys — scheduled function.
 *
 * Runs weekly on Sunday at 03:00 Africa/Porto-Novo. Scans active
 * profs whose lastLoginAt is older than 90 days (or missing entirely)
 * and:
 *
 *   1. Clears their loginPasskey field (set to '')
 *   2. Bumps loginPasskeyVersion — invalidates any HMAC tokens that
 *      were previously issued
 *   3. Emails a nudge telling them the code was retired due to
 *      inactivity, and to request a new one from admin
 *
 * Why this exists: a 6-digit code sitting on a doc indefinitely is
 * weak — enough reads, enough time, or enough subpoena-worthy
 * incidents and it leaks. Expiring unused codes means that even if
 * a prof never actually uses their account, their passkey doesn't
 * become a latent attack surface.
 *
 * The 90-day threshold is a compromise between being strict (too
 * strict = frustrating for teachers who only log in around periods
 * when they have grades to enter) and being lax (too lax = long-
 * tail zombie accounts). Adjustable via the INACTIVE_DAYS constant
 * below if experience suggests different.
 *
 * Active profs get a fresh passkey by asking an admin to regenerate
 * via the "Régénérer les codes manquants" button (Session E3), or
 * the admin UI can self-regenerate per-prof. Session E2 also gives
 * profs a self-serve "Régénérer mon code" button on Mon Profil.
 *
 * Idempotency: re-running the same week finds no freshly-expired
 * profs (the first run already cleared them) and no-ops cleanly.
 *
 * Email failure: logged, not thrown. The field clearing already
 * happened; retrying forever on a permanent email failure is waste.
 *
 * This is Session E1b. Dormant until Blaze deploy.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler'
import { logger } from 'firebase-functions/v2'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { db } from '../lib/firebase.js'
import { sendEmail, RESEND_API_KEY } from '../lib/email/send.js'
import { renderEmailShell, H1, P } from '../lib/email/layout.js'
import { isProbablyValidEmail, escapeHtml } from '../lib/email/format.js'

const INACTIVE_DAYS = 90

interface ProfDoc {
  email?: string
  nom?: string
  statut?: string
  loginPasskey?: string
  loginPasskeyVersion?: number
  lastLoginAt?: Timestamp
}

export const expireStalePasskeys = onSchedule(
  {
    schedule: 'every sunday 03:00',
    timeZone: 'Africa/Porto-Novo',
    region: 'us-central1',
    secrets: [RESEND_API_KEY],
    timeoutSeconds: 540,
  },
  async () => {
    logger.info('expireStalePasskeys: starting')

    const cutoff = Date.now() - INACTIVE_DAYS * 86_400_000
    const cutoffTs = Timestamp.fromMillis(cutoff)

    // Pull active profs with a loginPasskey set. We filter for
    // passkey presence first so we don't re-process already-expired
    // profs every week. Firestore composite index on
    // (statut, loginPasskey) not required — the where-with-inequality
    // trick uses loginPasskey != '' which is handled by Firestore's
    // default single-field index.
    let snap
    try {
      snap = await db
        .collection('professeurs')
        .where('statut', '==', 'actif')
        .get()
    } catch (err) {
      logger.error('expireStalePasskeys: query failed', {
        err: (err as Error).message,
      })
      return
    }

    const toExpire: Array<{ id: string; data: ProfDoc }> = []

    for (const doc of snap.docs) {
      const data = doc.data() as ProfDoc

      // Skip profs without a passkey (nothing to expire)
      if (!data.loginPasskey) continue

      // Skip profs who have logged in recently
      const last = data.lastLoginAt
      if (last && last.toMillis() > cutoff) continue

      // Either missing lastLoginAt (never logged in after activation,
      // OR activated pre-E1a migration and passkey was manually set)
      // OR lastLoginAt older than cutoff. Both qualify for expiry —
      // the existence of a passkey with no recent use is precisely
      // the risk we're mitigating.
      void cutoffTs // silence unused-var; reserved for future composite-index query
      toExpire.push({ id: doc.id, data })
    }

    logger.info('expireStalePasskeys: identified candidates', {
      total: snap.size,
      toExpire: toExpire.length,
    })

    if (toExpire.length === 0) return

    // Process one-by-one — each includes an email send + Firestore
    // write. Concurrent writes are fine but the email provider is
    // rate-limited so sequential is safer at this scale.
    let cleared = 0
    let emailed = 0

    for (const { id, data } of toExpire) {
      // Clear the passkey + bump version
      try {
        await db.doc(`professeurs/${id}`).update({
          loginPasskey: '',
          loginPasskeyVersion: FieldValue.increment(1),
        })
        cleared++
      } catch (err) {
        logger.warn('expireStalePasskeys: clear failed for one prof', {
          uid: id,
          err: (err as Error).message,
        })
        continue // skip email if we couldn't clear
      }

      // Best-effort email
      if (!isProbablyValidEmail(data.email)) continue

      const nom = data.nom ?? 'professeur(e)'
      const body = `
        ${H1('Votre code de connexion a été retiré')}
        ${P(`Bonjour ${escapeHtml(nom)},`)}
        ${P(`Par mesure de sécurité, votre code de connexion personnel a été retiré car votre compte n'a pas été utilisé depuis plus de ${INACTIVE_DAYS} jours.`)}
        ${P("Cette mesure limite l'exposition des codes dormants — si votre compte est resté inutilisé longtemps, un code non renouvelé devient un risque.")}
        ${P("Pour reprendre l'accès à votre espace, demandez à l'administration de régénérer votre code. Vous recevrez un nouvel email avec le nouveau code.")}
        ${P("Si vous ne reconnaissez pas cette activité, contactez immédiatement l'administration.")}
      `

      const html = renderEmailShell({
        body,
        preheader: 'Code de connexion retiré pour inactivité',
        signature: 'SchoolConnect — Accès sécurisé',
      })

      const text = `Bonjour ${nom},

Par mesure de sécurité, votre code de connexion personnel a été retiré car votre compte n'a pas été utilisé depuis plus de ${INACTIVE_DAYS} jours.

Pour reprendre l'accès à votre espace, demandez à l'administration de régénérer votre code.

— SchoolConnect
`

      try {
        await sendEmail({
          to: data.email!,
          subject: 'Code de connexion retiré (inactivité)',
          html,
          text,
          tag: 'passkey-expired-inactivity',
        })
        emailed++
      } catch (err) {
        logger.warn('expireStalePasskeys: email send failed', {
          uid: id,
          err: (err as Error).message,
        })
      }
    }

    logger.info('expireStalePasskeys: done', {
      cleared,
      emailed,
      skipped: toExpire.length - cleared,
    })
  }
)
