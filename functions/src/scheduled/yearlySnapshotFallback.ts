/**
 * Yearly snapshot fallback.
 *
 * Runs on August 31 at 03:00 Africa/Porto-Novo every year. Safety
 * net for the case where admin forgets to click "Archiver l'année"
 * before the new school year starts. Without this function, the
 * year's data would never get the permanent snapshot — it would
 * roll off the 30-day window and be lost.
 *
 * Logic:
 *   1. Read `/ecole/config`
 *   2. Compute the school year that just ended ("YYYY-YYYY+1"
 *      derived from the current calendar year)
 *   3. If `lastArchivedAnnee` matches → admin already ran the
 *      rollover, the `yearlySnapshotOnRollover` trigger already
 *      captured the snapshot. Nothing to do.
 *   4. If NOT matching → admin hasn't run rollover. Take an
 *      emergency snapshot NOW under a "fallback/" prefix (so it's
 *      distinguishable from the clean post-rollover snapshot) and
 *      email the admin a nudge.
 *
 * Why August 31: Béninois school year traditionally ends in mid-July
 * (BEPC/BAC). Plus make-up sessions + bulletin finalization can
 * stretch into early August. August 31 is the latest reasonable
 * date before the new year begins in September.
 *
 * A "fallback" snapshot captures the live state AS-IS (even if
 * bulletins aren't all finalized, élèves haven't been transitioned,
 * etc.). Imperfect but far better than no snapshot.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler'
import { logger } from 'firebase-functions/v2'
import { v1 } from '@google-cloud/firestore'
import { db } from '../lib/firebase.js'
import { sendEmail, RESEND_API_KEY } from '../lib/email/send.js'
import { renderEmailShell, H1, P, StrongP } from '../lib/email/layout.js'
import { isProbablyValidEmail } from '../lib/email/format.js'

const exportClient = new v1.FirestoreAdminClient()

/** Given a Date, returns "YYYY-YYYY+1" for the school year that contains it. */
function schoolYearContaining(d: Date): string {
  // Béninois academic year: starts ~September, ends ~August.
  // A date in Jan-Aug belongs to the year that started the previous September.
  const month = d.getMonth() // 0-indexed
  const year = d.getFullYear()
  const startYear = month >= 8 ? year : year - 1
  return `${startYear}-${startYear + 1}`
}

export const yearlySnapshotFallback = onSchedule(
  {
    schedule: '0 3 31 8 *', // August 31 at 03:00
    timeZone: 'Africa/Porto-Novo',
    region: 'us-central1',
    secrets: [RESEND_API_KEY],
    timeoutSeconds: 540,
  },
  async () => {
    // The just-ended school year (we run Aug 31, so "this year" ended
    // two months ago)
    const endedYear = schoolYearContaining(new Date())

    logger.info('yearlySnapshotFallback: run start', { endedYear })

    const configSnap = await db.doc('ecole/config').get()
    if (!configSnap.exists) {
      logger.warn('yearlySnapshotFallback: no /ecole/config — school may not be initialized; skip')
      return
    }
    const config = configSnap.data() as {
      anneeActive?: string
      lastArchivedAnnee?: string
      nom?: string
    }

    const lastArchived = config.lastArchivedAnnee ?? null
    if (lastArchived === endedYear) {
      logger.info('yearlySnapshotFallback: admin already ran rollover — skip', {
        endedYear,
      })
      return
    }

    logger.warn('yearlySnapshotFallback: rollover NOT run — triggering emergency snapshot', {
      endedYear,
      lastArchived,
    })

    // ─── 1. Fire the export ─────────────────────────────────
    const projectId = process.env.GCLOUD_PROJECT ?? ''
    if (!projectId) {
      throw new Error('GCLOUD_PROJECT not set')
    }
    const bucket = process.env.BACKUP_BUCKET ?? `${projectId}-backups`
    const outputUriPrefix = `gs://${bucket}/yearly/${endedYear}-fallback`
    const dbName = exportClient.databasePath(projectId, '(default)')

    try {
      const [response] = await exportClient.exportDocuments({
        name: dbName,
        outputUriPrefix,
        collectionIds: [],
      })
      logger.info('yearlySnapshotFallback: export initiated', {
        operationName: response.name,
        endedYear,
        outputUriPrefix,
      })
    } catch (err) {
      logger.error('yearlySnapshotFallback: export failed', {
        error: (err as Error).message,
      })
      throw err
    }

    // ─── 2. Nudge admin by email ────────────────────────────
    const schoolName = config.nom ?? 'Votre école'
    const adminsSnap = await db
      .collection('professeurs')
      .where('role', '==', 'admin')
      .limit(5)
      .get()

    const adminEmails: string[] = []
    adminsSnap.docs.forEach((d) => {
      const e = d.data()['email'] as string | undefined
      if (e && isProbablyValidEmail(e)) adminEmails.push(e)
    })

    if (adminEmails.length === 0) {
      logger.warn('yearlySnapshotFallback: no admin email — skipping nudge')
      return
    }

    const body = `
      ${H1('Clôture de l\'année non effectuée')}
      ${P(`L'année scolaire <strong>${endedYear}</strong> est terminée, mais la clôture n'a pas encore été lancée pour <strong>${schoolName}</strong>.`)}
      ${StrongP('Une sauvegarde automatique a été créée pour protéger vos données.')}
      ${P('Pensez à lancer manuellement la procédure de clôture annuelle dès que possible, depuis l\'onglet Année → Archiver l\'année. Cela permettra de :')}
      <ul style="margin:0 0 14px 20px;padding:0;">
        <li style="margin-bottom:6px;">Transitionner les élèves admis vers leurs nouvelles classes</li>
        <li style="margin-bottom:6px;">Archiver proprement les bulletins et notes de l'année</li>
        <li style="margin-bottom:6px;">Réinitialiser les affectations des professeurs pour la nouvelle rentrée</li>
      </ul>
      ${P('Tant que la clôture n\'est pas lancée, la nouvelle année scolaire ne peut pas démarrer proprement.')}
    `

    const html = renderEmailShell({
      body,
      preheader: `Clôture de l'année ${endedYear} en attente`,
      signature: 'SchoolConnect — Alerte maintenance',
    })

    const text = `L'année scolaire ${endedYear} est terminée, mais la clôture n'a pas encore été lancée pour ${schoolName}.

Une sauvegarde automatique a été créée pour protéger vos données.

Pensez à lancer la clôture depuis l'onglet Année → Archiver l'année.

— SchoolConnect
`

    for (const to of adminEmails) {
      await sendEmail({
        to,
        subject: `Clôture de l'année ${endedYear} en attente — ${schoolName}`,
        html,
        text,
        tag: 'yearly-snapshot-fallback-nudge',
      })
    }

    logger.info('yearlySnapshotFallback: nudge sent', {
      recipients: adminEmails.length,
    })
  }
)
