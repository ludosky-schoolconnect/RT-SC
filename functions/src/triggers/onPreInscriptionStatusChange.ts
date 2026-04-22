/**
 * onPreInscriptionStatusChange trigger.
 *
 * Fires when /pre_inscriptions/{id} is updated. Emails the applicant
 * IF:
 *   1. They provided an `emailParent` when submitting
 *   2. `statut` actually changed (not just an unrelated field update)
 *   3. New status is Approuvé or Refusé (we don't email on the
 *      intermediate "EnAttente" or on revocations back to pending)
 *
 * Silent skip (logged at info level, not error) when any of those
 * conditions fails. We don't want to pollute error metrics with
 * benign cases like "admin updated the categorieDossier field."
 *
 * Idempotency: we don't write anything back to the doc. The trigger
 * fires on every update but the status-change check makes it safe:
 * if admin re-saves without changing status, no email fires.
 */

import { onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { logger } from 'firebase-functions/v2'
import { db } from '../lib/firebase.js'
import { sendEmail, RESEND_API_KEY } from '../lib/email/send.js'
import { renderPreInscriptionStatusEmail } from '../lib/email/templates/preInscriptionStatus.js'
import { isProbablyValidEmail } from '../lib/email/format.js'

/** Parse "DD/MM/YYYY" → Date, null if malformed. Matches the PI storage format. */
function parseFrDate(value: string | undefined): Date | undefined {
  if (!value) return undefined
  const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return undefined
  const [, dd, mm, yyyy] = m
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd))
  if (Number.isNaN(d.getTime())) return undefined
  return d
}

interface PreInscriptionDoc {
  nom?: string
  emailParent?: string
  trackingCode?: string
  statut?: string
  raisonRefus?: string
  dateRV?: string        // "DD/MM/YYYY"
  classeCible?: string
}

export const onPreInscriptionStatusChange = onDocumentUpdated(
  {
    document: 'pre_inscriptions/{id}',
    region: 'us-central1',
    secrets: [RESEND_API_KEY],
  },
  async (event) => {
    const id = event.params.id

    const before = event.data?.before?.data() as PreInscriptionDoc | undefined
    const after = event.data?.after?.data() as PreInscriptionDoc | undefined
    if (!before || !after) return

    // 1. Status must have changed
    if (before.statut === after.statut) {
      logger.info('onPreInscriptionStatusChange: no status change — skip', { id })
      return
    }

    // 2. New status must be Approuvé or Refusé
    if (after.statut !== 'Approuvé' && after.statut !== 'Refusé') {
      logger.info('onPreInscriptionStatusChange: status not Approuvé/Refusé — skip', {
        id,
        statut: after.statut,
      })
      return
    }

    // 3. Must have a valid email
    const to = after.emailParent?.trim()
    if (!to || !isProbablyValidEmail(to)) {
      logger.info('onPreInscriptionStatusChange: no valid emailParent — skip', { id })
      return
    }

    // 4. Look up school name (for branding)
    const configSnap = await db.doc('ecole/config').get()
    const schoolName =
      (configSnap.exists &&
        (configSnap.data()?.['nom'] as string | undefined)) ||
      'Votre école'

    // 5. Build tracking URL. We use the Firebase-hosted canonical
    //    domain of this project. Admin can override via env if they
    //    have a custom domain registered.
    const baseUrl =
      process.env.SCHOOL_APP_URL ??
      `https://${process.env.GCLOUD_PROJECT ?? 'schoolconnect'}.web.app`
    const trackingUrl = `${baseUrl}/inscription/suivi`

    // 6. Render + send
    const { subject, html, text } = renderPreInscriptionStatusEmail({
      applicantName: after.nom ?? 'Candidat',
      schoolName,
      trackingCode: after.trackingCode ?? '',
      trackingUrl,
      statut: after.statut as 'Approuvé' | 'Refusé',
      dateRV: parseFrDate(after.dateRV),
      classeCible: after.classeCible,
      raisonRefus: after.raisonRefus,
    })

    const res = await sendEmail({
      to,
      subject,
      html,
      text,
      tag: `preinscription-${after.statut.toLowerCase()}`,
    })

    if (!res.ok) {
      logger.error('onPreInscriptionStatusChange: send failed', {
        id,
        to,
        error: res.error,
      })
    } else {
      logger.info('onPreInscriptionStatusChange: sent', {
        id,
        to,
        statut: after.statut,
      })
    }
  }
)
