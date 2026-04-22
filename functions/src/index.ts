/**
 * RT-SC Cloud Functions · entry point.
 *
 * Every function exported from this file becomes a deployable Cloud
 * Function. Adding a new function = import it here + re-export it.
 * Firebase inspects the exports at deploy time to know what to ship.
 *
 * The current function set is INTENTIONALLY SMALL — this is
 * Session A of the Blaze foundation rollout:
 *
 *   - onProfDelete     → deletes Auth user when /professeurs/{uid} doc
 *                        is removed, closing the ghost-account gap
 *   - fedapayWebhook   → receives FedaPay payment events, extends the
 *                        subscription deadline server-side (closes the
 *                        F12 admin-self-extension hole)
 *
 * Future sessions (B, C, D) will add:
 *   - Email pipeline (onBulletinCreate, onPaiementCreate, onAbsenceCreate,
 *                     onAnnonceCreate, onPreInscriptionUpdate)
 *   - Scheduled jobs (dailyPresenceRollover, monthlyCivismePurge,
 *                     weeklySubscriptionExpiryReminder, nightlyBackup)
 *
 * See /DEPLOY-ONCE-BLAZE-IS-READY.md in the repo root for the step
 * by step deploy checklist.
 */

export { onProfDelete } from './triggers/onProfDelete.js'
export { fedapayWebhook } from './http/fedapayWebhook.js'
