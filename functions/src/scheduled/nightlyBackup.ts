/**
 * Nightly Firestore backup.
 *
 * Runs at 02:00 Africa/Porto-Novo every day. Triggers a full
 * Firestore export to the school's backup bucket. Retention of old
 * exports is handled by a GCS lifecycle rule (configured once at
 * setup time per the deploy playbook), NOT by this function.
 * Delegating retention to GCS means:
 *   - No "list old folders and delete" logic here to get wrong
 *   - Lifecycle rules are atomic and can't partially-fail
 *   - Admin can see the retention policy in the GCP console
 *
 * Bucket naming convention (set by deploy playbook):
 *   gs://<projectId>-backups/
 *
 * Directory layout inside the bucket:
 *   daily/YYYY-MM-DD/        ← rotated (30-day lifecycle rule)
 *   yearly/<annee>/          ← kept forever (written by a separate
 *                              trigger on year rollover; see
 *                              yearlySnapshotOnRollover.ts)
 *
 * Required IAM: the Cloud Functions default service account
 * (`<project>@appspot.gserviceaccount.com`) needs two roles on the
 * project:
 *   - roles/datastore.importExportAdmin  (to trigger exports)
 *   - roles/storage.admin                (to write to the bucket)
 * The deploy playbook walks through granting these.
 *
 * Cost at 10 schools:
 *   - 1 export/day × 365 = 365 exports/year per school. Exports
 *     themselves are free; you pay only for (a) Firestore reads
 *     during export (10 GB/day free, we're at ~100 MB/school/day,
 *     fine) and (b) the resulting GCS storage (~$0.10/school/month
 *     at 30-day retention).
 *
 * Failure mode: if the export call returns an error, we log it and
 * throw. Cloud Scheduler will retry once on its default policy; a
 * second failure surfaces in Cloud Functions error metrics. Data
 * loss risk: ONE missed backup (yesterday's state gone, today's
 * backup covers last 30-1 = 29 days). Acceptable; recovery still
 * possible.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler'
import { logger } from 'firebase-functions/v2'
import { v1 } from '@google-cloud/firestore'

const exportClient = new v1.FirestoreAdminClient()

export const nightlyBackup = onSchedule(
  {
    schedule: '0 2 * * *', // 02:00 every day
    timeZone: 'Africa/Porto-Novo',
    region: 'us-central1',
    // 540s (9 minutes) is enough for a school-sized export to kick off;
    // the export runs async in the background on Google's side.
    timeoutSeconds: 540,
  },
  async () => {
    const projectId = process.env.GCLOUD_PROJECT ?? ''
    if (!projectId) {
      logger.error('nightlyBackup: GCLOUD_PROJECT not set')
      throw new Error('GCLOUD_PROJECT environment variable missing')
    }

    // Bucket naming convention set by deploy playbook
    const bucket = process.env.BACKUP_BUCKET ?? `${projectId}-backups`

    // Directory-style prefix — GCS doesn't have real directories but
    // Firestore export uses a "folder" path. YYYY-MM-DD in Bénin time.
    const now = new Date()
    const beninMs = now.getTime() + 60 * 60 * 1000
    const benin = new Date(beninMs)
    const y = benin.getUTCFullYear()
    const m = String(benin.getUTCMonth() + 1).padStart(2, '0')
    const d = String(benin.getUTCDate()).padStart(2, '0')
    const dateKey = `${y}-${m}-${d}`

    const outputUriPrefix = `gs://${bucket}/daily/${dateKey}`
    const dbName = exportClient.databasePath(projectId, '(default)')

    logger.info('nightlyBackup: starting export', {
      dbName,
      outputUriPrefix,
    })

    try {
      const [response] = await exportClient.exportDocuments({
        name: dbName,
        outputUriPrefix,
        // Empty collectionIds array = export ALL collections.
        collectionIds: [],
      })

      logger.info('nightlyBackup: export initiated', {
        operationName: response.name,
        outputUriPrefix,
      })
    } catch (err) {
      logger.error('nightlyBackup: export failed', {
        error: (err as Error).message,
        outputUriPrefix,
      })
      throw err
    }
  }
)
