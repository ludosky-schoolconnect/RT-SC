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
Runs every day at **00:00 Africa/Porto-Novo**. For each school, emails
the admin:
- 14 days before deadline (friendly heads-up)
- 7 days before (urgent)
- 3 days before (last chance)
- During the 3-day grace period after expiry (escalating)

After that, LockedPage takes over (the school will be locked, so
email is no longer the right channel).

Idempotency: writes `lastReminderSent` + `lastReminderDate` on
`/ecole/subscription` to prevent duplicate sends on the same day.

### `triggers/onPreInscriptionStatusChange`
Fires when `/pre_inscriptions/{id}` is updated. If `statut` changed
to `Approuvé` or `Refusé` AND the applicant provided an
`emailParent`, sends them a status email.

Approved emails include the RV date and assigned class.
Refused emails include the reason if admin provided one.

Parents without email still track via the SC-XXXXXX code.

### `http/testEmail`
POST to this endpoint with a JSON body `{"to": "you@example.com",
"secret": "<TESTEMAIL_SECRET>"}` to verify Resend wiring. See Blaze
playbook for setup.

## Dependencies used this round

- `resend` — transactional email (added in Session B)

## Secrets per school

Already in Session A:
- `FEDAPAY_WEBHOOK_SECRET` — per-school, from FedaPay dashboard

Added in Session B:
- `RESEND_API_KEY` — shared across all school projects (one Resend
  account, one key)
- `TESTEMAIL_SECRET` — any random string; used as a gate on
  `testEmail` so random internet traffic can't trigger it

Environment (not secrets):
- `EMAIL_FROM` — e.g. `"SchoolConnect <onboarding@resend.dev>"` in
  dev, `"SchoolConnect <no-reply@yourdomain.bj>"` in prod
- `SCHOOL_APP_URL` (optional) — overrides the default
  `https://<project>.web.app` for links inside emails

## Local emulator testing

Functions run in the Firebase emulator without Blaze. Resend
integration won't deliver mail unless you set `RESEND_API_KEY` to a
real key, but you can test payload shapes by commenting out the
`sendEmail` call and logging the template output.

```bash
cd functions
npm install
npm run build
firebase emulators:start --only functions,firestore
```

## Deploy (Blaze only)

See `/DEPLOY-ONCE-BLAZE-IS-READY.md` at the repo root. Never run
`firebase deploy --only functions` on a Spark-plan project — it fails
with a billing error.

## Pending sessions

- **Session C — Scheduled jobs**: daily presence rollover, monthly
  civisme purge, nightly Firestore backup with 30-day rotation +
  at-rollover annual snapshot
- **Session D — Frontend cleanup**: remove `useArchiveRollover`,
  `useSchoolAbsences` batch-delete, manual Purger button
