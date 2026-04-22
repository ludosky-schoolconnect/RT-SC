/**
 * RT-SC Cloud Functions · entry point.
 *
 * Every function exported from this file becomes a deployable Cloud
 * Function. Adding a new function = import it here + re-export it.
 * Firebase inspects the exports at deploy time to know what to ship.
 *
 * Sessions shipped to date (dormant until Blaze activation):
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
 * Pending sessions:
 *   Session C — Scheduled jobs (daily rollover, civisme purge, backups)
 *   Session D — Frontend cleanup (remove client-side workarounds)
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
