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
 *     - onProfDelete, fedapayWebhook
 *
 *   Session B — Email pipeline
 *     - subscriptionReminder, onPreInscriptionStatusChange, testEmail
 *
 *   Session C — Scheduled jobs + backups
 *     - dailyPresenceRollover, monthlyCivismePurge,
 *       weeklyStaleAbsencesCleanup, nightlyBackup,
 *       yearlySnapshotOnRollover, yearlySnapshotFallback
 *
 *   Session E1a — Prof security + orphan cleanup (foundation)
 *     - verifyProfLogin, onProfActivated,
 *       onProfDeleteCascade, onClasseDelete
 *
 *   Session E1b — Prof security + orphan cleanup (completion)
 *     - onEleveDeleteCascade, onPreInscriptionDelete,
 *       expireStalePasskeys, findEleveIdentity, regenerateOwnPasskey
 *
 *   Session E3 — Rules tightening + admin migration (new)
 *     - regeneratePasskeyForProf (admin-only, for the "Générer les
 *       codes manquants" migration button in the Profs tab)
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
export { weeklyStaleAbsencesCleanup } from './scheduled/weeklyStaleAbsencesCleanup.js'
export { nightlyBackup } from './scheduled/nightlyBackup.js'
export { yearlySnapshotOnRollover } from './triggers/yearlySnapshotOnRollover.js'
export { yearlySnapshotFallback } from './scheduled/yearlySnapshotFallback.js'

// ── Session E1a
export { verifyProfLogin } from './http/verifyProfLogin.js'
export { onProfActivated } from './triggers/onProfActivated.js'
export { onProfDeleteCascade } from './triggers/onProfDeleteCascade.js'
export { onClasseDelete } from './triggers/onClasseDelete.js'

// ── Session E1b
export { onEleveDeleteCascade } from './triggers/onEleveDeleteCascade.js'
export { onPreInscriptionDelete } from './triggers/onPreInscriptionDelete.js'
export { expireStalePasskeys } from './scheduled/expireStalePasskeys.js'
export { findEleveIdentity } from './http/findEleveIdentity.js'
export { regenerateOwnPasskey } from './http/regenerateOwnPasskey.js'

// ── Session E3
export { regeneratePasskeyForProf } from './http/regeneratePasskeyForProf.js'
