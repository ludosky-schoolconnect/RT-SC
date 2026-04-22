# RT-SC Cloud Functions

**Status: DORMANT.** Code lives in the repo, nothing executes until Blaze
is enabled and `firebase deploy --only functions` runs.

## Session A — Security (shipped, dormant)

### `triggers/onProfDelete`
Fires when `/professeurs/{uid}` is deleted. Deletes the matching
Firebase Auth account so removed staff lose access immediately.

### `http/fedapayWebhook`
HTTP endpoint FedaPay POSTs to when a transaction is approved.
Verifies HMAC signature, computes the new deadline, writes it with
admin credentials. The Firestore rule (in `firestore.rules.blaze`)
restricts client-side `deadline` writes to the service account so
admins can't F12-extend.

Webhook URL per school:
```
https://us-central1-<schoolId>.cloudfunctions.net/fedapayWebhook
```

## Session B — Email pipeline (shipped, dormant)

### `scheduled/subscriptionReminder`
Runs every day at **00:00 Africa/Porto-Novo**. Emails admin at
14/7/3 days before deadline and during the 3-day grace period.

### `triggers/onPreInscriptionStatusChange`
Fires when `/pre_inscriptions/{id}` is updated. If `statut` changed
to `Approuvé` or `Refusé` AND the applicant provided an
`emailParent`, sends them a status email.

### `http/testEmail`
Smoke-test endpoint gated by `TESTEMAIL_SECRET`. Use once after
deploy to verify email delivery. Delete after verification.

## Session C — Scheduled jobs + backups (shipped, dormant)

### `scheduled/dailyPresenceRollover`
Runs **00:05 Africa/Porto-Novo**. Moves yesterday's `/presences/*`
docs to `/archived_absences/{compositeId}`. Replaces the client-side
lazy-on-read rollover in `src/hooks/useArchiveRollover.ts`.

### `scheduled/monthlyCivismePurge`
Runs **01:00 on the 1st of every month**. Deletes terminal-state
quêtes and réclamations older than 180 days (plus cascade of claims).
Replaces the manual "Purger" button in the Civisme tab.

### `scheduled/nightlyBackup`
Runs **02:00 daily**. Triggers a full Firestore export to
`gs://<project>-backups/daily/YYYY-MM-DD/`. Retention (30 days) is
enforced by a GCS lifecycle rule — not by this function.

### `triggers/yearlySnapshotOnRollover`
Fires when `/ecole/config.lastArchivedAnnee` changes (admin has run
year rollover). Exports to `gs://<project>-backups/yearly/<annee>/`.
This path is NOT covered by the lifecycle rule — kept forever.

### `scheduled/yearlySnapshotFallback`
Runs **August 31 at 03:00** every year. If admin hasn't run rollover
by now, triggers an emergency snapshot to
`gs://<project>-backups/yearly/<annee>-fallback/` and emails the admin
a nudge.

## Dependencies used

- `firebase-admin` — core
- `firebase-functions` — Functions v2 (`onSchedule`, `onRequest`, `onDocumentUpdated`, `onDocumentDeleted`)
- `resend` — transactional email (Session B)
- `@google-cloud/firestore` — `FirestoreAdminClient` for export operations (Session C)

## Secrets per school

Session A:
- `FEDAPAY_WEBHOOK_SECRET` — per-school, from FedaPay dashboard

Session B:
- `RESEND_API_KEY` — shared across all school projects
- `TESTEMAIL_SECRET` — random string; gates `testEmail` endpoint

Session C: no new secrets. Uses IAM permissions on the default Cloud
Functions service account (`<project>@appspot.gserviceaccount.com`):
- `roles/datastore.importExportAdmin`
- `roles/storage.admin`
(granted once per school via the deploy playbook)

Environment (not secrets):
- `EMAIL_FROM` — sender address (Session B)
- `SCHOOL_APP_URL` (optional) — overrides default `https://<project>.web.app` in email links
- `BACKUP_BUCKET` (optional) — overrides default `<project>-backups`

## Local emulator testing

```bash
cd functions
npm install
npm run build
firebase emulators:start --only functions,firestore
```

Scheduled functions don't trigger automatically in emulator. Test
them via `firebase functions:shell`:

```bash
firebase functions:shell --project <projectId>
> dailyPresenceRollover()
> monthlyCivismePurge()
```

Backups can't be tested locally — they require the real Firestore
export API. Verify via `firebase deploy --only functions` against a
dev project.

## Deploy (Blaze only)

See `/DEPLOY-ONCE-BLAZE-IS-READY.md` at the repo root. Never run
`firebase deploy --only functions` on a Spark-plan project — fails
with a billing error.

## Pending session

- **Session D — Frontend cleanup**: remove `useArchiveRollover`,
  `useSchoolAbsences` batch-delete, manual Purger button now that
  scheduled functions cover them.
