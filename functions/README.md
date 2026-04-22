# RT-SC Cloud Functions

**Status: DORMANT.** This directory contains the server-side logic
that will activate when Blaze is enabled on the project. Until then,
nothing here runs — the code just sits in the repo, versioned and
ready.

## Why this exists

Pre-Blaze, certain operations have to happen client-side (e.g. the
subscription deadline is extended in the admin's browser after a
FedaPay payment). This creates a security hole: an admin can call the
mutation directly from DevTools and extend their own deadline for
free. Cloud Functions lets a trusted server do these writes instead,
with Firestore rules enforcing that clients can't.

## What's here (Session A)

### `triggers/onProfDelete`
Fires when `/professeurs/{uid}` is deleted. Deletes the matching
Firebase Auth account so removed staff lose access immediately.

### `http/fedapayWebhook`
HTTP endpoint FedaPay POSTs to when a transaction is approved.
Verifies the HMAC signature (rejecting spoofed requests), reads the
current subscription, computes the new deadline (early-pay vs late-pay
math mirrored from `src/hooks/useSubscription.ts`), and writes it
with admin credentials. The Firestore rule (deployed alongside)
restricts `deadline` writes to the service account so clients can't
spoof them.

Webhook URL shape per school:
```
https://us-central1-<schoolId>.cloudfunctions.net/fedapayWebhook
```
Register this in each school's FedaPay dashboard under Settings →
Webhooks.

## What's coming (future sessions)

- **Session B · Email pipeline** — Resend integration + transactional
  email triggers (bulletin ready, payment received, absence declared,
  pre-inscription status change, subscription expiring)
- **Session C · Scheduled jobs** — daily presence rollover, monthly
  civisme purge, weekly subscription expiry reminder, nightly
  Firestore backup with 30-day rotation + annual frozen snapshot
- **Session D · Frontend cleanup** — remove the client-side workarounds
  (`useArchiveRollover`, manual "Purger" button, `useSchoolAbsences`
  14-day batch delete) once the scheduled functions replace them

## Deploying

Do NOT `firebase deploy --only functions` until Blaze is enabled on
the target project. See `/DEPLOY-ONCE-BLAZE-IS-READY.md` for the full
checklist. Deploying on the free Spark plan will fail with a billing
error.

## Local development (Spark-compatible)

You can run the emulator on Spark — functions don't actually execute
Cloud resources when running locally.

```bash
cd functions
npm install
npm run build
firebase emulators:start --only functions,firestore
```

## Secrets

Production secrets live in Firebase Functions secret store, set with:

```bash
firebase functions:secrets:set FEDAPAY_WEBHOOK_SECRET --project schoolconnect-<id>
firebase functions:secrets:set RESEND_API_KEY --project schoolconnect-<id>
```

Per-school: `FEDAPAY_WEBHOOK_SECRET` must be set separately per
project (each school has its own FedaPay account).

Shared across schools: `RESEND_API_KEY` can be the same value on
every project if you use one Resend account for all.

For local dev, copy `.env.example` → `.env` and fill in test values.
`.env` is `.gitignore`d — never commit real secrets.
