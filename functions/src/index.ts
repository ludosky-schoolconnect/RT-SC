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
 *     - dailyPresenceRollover       → Runs 00:05, moves yesterday's
 *                                     presence docs to /archived_absences.
 *     - monthlyCivismePurge         → 01:00 on the 1st of each month,
 *                                     deletes terminal-state quêtes/réclamations
 *                                     older than 180 days.
 *     - weeklyStaleAbsencesCleanup  → Sunday 02:30, removes declared
 *                                     absences older than 14 days.
 *     - nightlyBackup               → 02:00 daily Firestore export.
 *     - yearlySnapshotOnRollover    → fires on admin year rollover.
 *     - yearlySnapshotFallback      → Aug 31 at 03:00 emergency fallback.
 *
 *   Session E1a — Prof security + orphan cleanup (foundation)
 *     - verifyProfLogin             → HTTPS callable: email+passkey → 12h HMAC token
 *     - onProfActivated             → generates passkey + emails on en_attente→actif
 *     - onProfDeleteCascade         → cleans matieresProfesseurs map, notes.professeurId,
 *                                     colles.donneParProfId
 *     - onClasseDelete              → cleans presences, publications, emploisDuTemps,
 *                                     coefficients
 *
 *   Session E1b — Prof security + orphan cleanup (completion)
 *     - onEleveDeleteCascade        → safety-net for éleve subcols + annuaire_parents
 *                                     by eleveId + quete claims by eleveId
 *     - onPreInscriptionDelete      → documents/* subcollection
 *     - expireStalePasskeys         → weekly Sunday 03:00 — clears loginPasskey
 *                                     for profs inactive 90+ days, emails nudge
 *     - findEleveIdentity           → HTTPS callable replacing unauthenticated
 *                                     collectionGroup(eleves) scans in EleveSignup
 *                                     and ParentLogin
 *     - regenerateOwnPasskey        → HTTPS callable: prof rotates their own
 *                                     loginPasskey (used by Mon Profil in E2)
 *
 * Pending sessions:
 *   Session E2 — client callables wiring (passkey gate, éleve/parent lookup)
 *   Session E3 — rules tightening + migration admin button
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
