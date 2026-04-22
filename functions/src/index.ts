/**
 * RT-SC Cloud Functions · entry point.
 *
 * Every function exported from this file becomes a deployable Cloud
 * Function. Adding a new function = import it here + re-export it.
 * Firebase inspects the exports at deploy time to know what to ship.
 *
 * Sessions shipped (dormant until Blaze activation):
 *
 *   Session A — Security foundations
 *     - onProfDelete     → deletes Auth user when /professeurs/{uid} doc
 *                          is removed, closing the ghost-account gap
 *     - fedapayWebhook   → receives FedaPay payment events, extends the
 *                          subscription deadline server-side (closes the
 *                          F12 admin-self-extension hole)
 *
 *   Session B — Email pipeline (Resend-backed)
 *     - subscriptionReminder          → scheduled daily at 00:00 Africa/Porto-Novo,
 *                                       emails admin at 14/7/3 days before deadline
 *                                       + during 3-day grace period
 *     - onPreInscriptionStatusChange  → emails applicant when admin approves
 *                                       or refuses their dossier (if emailParent
 *                                       was provided at submission)
 *     - testEmail                     → HTTP smoke-test endpoint (optional,
 *                                       delete after verifying delivery)
 *
 *   Session C — Scheduled jobs + backups
 *     - dailyPresenceRollover       → replaces client-side useArchiveRollover.
 *                                     Runs 00:05 Africa/Porto-Novo, moves
 *                                     yesterday's presence docs to /archived_absences.
 *     - monthlyCivismePurge         → replaces the manual "Purger" button.
 *                                     Runs 01:00 on the 1st of each month,
 *                                     deletes terminal-state quêtes/réclamations
 *                                     older than 180 days.
 *     - nightlyBackup               → 02:00 daily Firestore export to
 *                                     gs://<project>-backups/daily/<date>/
 *                                     Retention via GCS lifecycle rule (30 days).
 *     - yearlySnapshotOnRollover    → fires when admin finalizes year rollover.
 *                                     Exports to gs://<project>-backups/yearly/<annee>/
 *                                     (kept forever, no lifecycle rule on that path).
 *     - yearlySnapshotFallback      → scheduled Aug 31 at 03:00. If admin
 *                                     hasn't run rollover, triggers emergency
 *                                     snapshot + emails admin a nudge.
 *
 * Pending session:
 *   Session D — Frontend cleanup (remove now-redundant client-side workarounds)
 *
 * See /DEPLOY-ONCE-BLAZE-IS-READY.md for the step-by-step deploy checklist.
 */

// ── Session A
export { onProfDelete } from './triggers/onProfDelete.js'
export { fedapayWebhook } from './http/fedapayWebhook.js'

// ── Session B
export { subscriptionReminder } from './scheduled/subscriptionReminder.js'
export { onPreInscriptionStatusChange } from './triggers/onPreInscriptionStatusChange.js'
export { testEmail } from './http/testEmail.js'

// ── Session C
export { dailyPresenceRollover } from './scheduled/dailyPresenceRollover.js'
export { monthlyCivismePurge } from './scheduled/monthlyCivismePurge.js'
export { nightlyBackup } from './scheduled/nightlyBackup.js'
export { yearlySnapshotOnRollover } from './triggers/yearlySnapshotOnRollover.js'
export { yearlySnapshotFallback } from './scheduled/yearlySnapshotFallback.js'
