# Blaze Activation Playbook

**Read this the day you flip Blaze on.** Step by step, with exact commands.
Don't skip ahead — some steps depend on prior state.

---

## Prerequisites

- [ ] You have a valid payment method registered in Google Cloud Billing
- [ ] You have created an account at https://resend.com (free tier) if doing emails (Session B+)
- [ ] Each school has its own FedaPay merchant account set up and
      verified at https://fedapay.com. The `fedaPayPublicKey` for each
      school is already in its `/ecole/subscription` doc (set via the
      vendor-app's BootstrapScreen during school creation).
- [ ] You have dashboard access to each school's FedaPay account
      (or the school's admin will create the webhook themselves via
      Phase 5 — see note below)

---

## Phase 1 — Enable Blaze + set billing guardrails

**Do this PER SCHOOL PROJECT** (each Firebase project is billed independently).

For each school project (e.g. `schoolconnect-nlg`, `schoolconnect-mag`, `schoolconnect-houeto`,
and eventually the hub `schoolconnect-1adfa`):

1. Open https://console.firebase.google.com → pick the project → Usage and Billing
2. **Modify plan → Blaze (pay as you go)** → confirm with your billing account
3. Go to https://console.cloud.google.com/billing → pick your billing account → Budgets & alerts
4. **Create budget** → scope to this one project →
   - Amount: **$5 per month**
   - Alerts at 50%, 90%, 100% of actual spend
   - Send to your email
5. Repeat for the next school.

**Why per-project**: a bug burning invocations in one school's Firebase project
should not drain the budget of the others. Separate budgets = separate alarms =
contained blast radius.

---

## Phase 2 — Install functions dependencies locally

One-time setup on your Termux dev box:

```bash
cd ~/RT-SC/functions
npm install
npm run build
```

If `npm run build` succeeds with no errors, the scaffold is healthy.

**Expected**: a `lib/` directory appears with compiled JavaScript.
If you see type errors, paste them to Claude in a new session — something
drifted between the schema and the code.

---

## Phase 3 — Per-school secrets

**Do this PER SCHOOL PROJECT.** The FedaPay webhook secret is unique per
school because each school has its own FedaPay merchant account.

### 3a. About the FedaPay webhook secret

**Order-of-operations note**: FedaPay generates the webhook secret
when you CREATE a webhook in their dashboard — and a webhook needs
the Cloud Function URL — which only exists after you first deploy
the function. So the sequence is:

  1. Deploy functions (Phase 4) → note the `fedapayWebhook` URL
  2. Create the webhook in FedaPay dashboard using that URL (Phase 5)
     → FedaPay shows you the secret one time
  3. Come BACK here (Phase 3a) to set the secret on Firebase, then
     redeploy once so the function loads it

Don't try to complete Phase 3a before Phase 4. The instructions
below are what you run AFTER Phase 5 gives you the secret.

### 3b. Set the FedaPay webhook secret in Firebase

Once you have a webhook secret from FedaPay (from Phase 5):

```bash
# For NLG:
firebase functions:secrets:set FEDAPAY_WEBHOOK_SECRET --project schoolconnect-nlg
# Paste the secret when prompted. It's stored encrypted at rest.

# Repeat for each school:
firebase functions:secrets:set FEDAPAY_WEBHOOK_SECRET --project schoolconnect-mag
firebase functions:secrets:set FEDAPAY_WEBHOOK_SECRET --project schoolconnect-houeto
# ... etc for every school
```

After setting the secret, redeploy the function so the runtime loads
the new value:

```bash
firebase deploy --only functions:fedapayWebhook --project schoolconnect-nlg
```

### 3c. Resend + email secrets (Session B — email pipeline)

Sessions A and B are both in the repo. If you're activating both at once,
do these setup steps before Phase 4 (first deploy).

**Step 1 — Create a Resend account**

1. Go to https://resend.com and sign up (free tier = 3,000 emails/month,
   more than enough for a long time)
2. In Resend dashboard → API Keys → Create API Key
3. Copy the key (starts with `re_...`). You only see it once — store it
   somewhere you can retrieve later (Bitwarden, 1Password, etc.)

**Step 2 — Decide on your "from" address**

For dev/testing, the default `onboarding@resend.dev` works but ONLY
delivers to your Resend account's own email. Production needs a verified
domain.

To use your own domain (recommended before real schools):
1. Resend dashboard → Domains → Add Domain → enter e.g. `schoolconnect.bj`
2. Add the DNS records Resend shows you (SPF, DKIM) at your domain registrar
3. Wait a few minutes, click "Verify"
4. Once verified, you can send from `<anything>@schoolconnect.bj`

**Step 3 — Set the secrets per school**

```bash
# Single Resend key, same for every school project
firebase functions:secrets:set RESEND_API_KEY --project schoolconnect-nlg
# (paste the re_... key)
firebase functions:secrets:set RESEND_API_KEY --project schoolconnect-mag
firebase functions:secrets:set RESEND_API_KEY --project schoolconnect-houeto
# ... per school

# Testemail secret — make up any long random string, same one per school
# You'll use this to curl-test delivery after first deploy
firebase functions:secrets:set TESTEMAIL_SECRET --project schoolconnect-nlg
firebase functions:secrets:set TESTEMAIL_SECRET --project schoolconnect-mag
# ... per school
```

**Step 4 — Set the EMAIL_FROM env var (not a secret, but configured per project)**

In `functions/.env.<projectid>` (one file per school), write:

```bash
# functions/.env.schoolconnect-nlg
EMAIL_FROM=SchoolConnect <onboarding@resend.dev>
SCHOOL_APP_URL=https://schoolconnect-nlg.web.app
```

Firebase Functions automatically loads these when deploying to that project.
If you own a domain and verified it in Resend, change to e.g.
`EMAIL_FROM=SchoolConnect <no-reply@schoolconnect.bj>`.

**Note on CLAUDE-BRIEFING**: if you add a new school, don't forget to
create its `.env.<projectid>` file alongside the others.

---

### 3d. Backup bucket + IAM (Session C — scheduled jobs)

Session C's backup functions need two things per school:
1. A Cloud Storage bucket to write exports into
2. IAM permissions on the Cloud Functions service account so it can
   trigger Firestore exports and write to the bucket

**Step 1 — Create the bucket (per school)**

```bash
# Naming convention: <projectId>-backups
gcloud storage buckets create "gs://schoolconnect-nlg-backups" \
  --project=schoolconnect-nlg \
  --location=us-central1 \
  --uniform-bucket-level-access

# Repeat per school
gcloud storage buckets create "gs://schoolconnect-mag-backups" \
  --project=schoolconnect-mag \
  --location=us-central1 \
  --uniform-bucket-level-access
```

If `gcloud` isn't available on Termux, use the GCP Console:
1. https://console.cloud.google.com → select the school project
2. Cloud Storage → Buckets → Create
3. Name: `<projectId>-backups`
4. Location: `us-central1` (multi-region not needed for backups)
5. Access control: Uniform
6. Create

**Step 2 — Set the 30-day lifecycle rule on `daily/` prefix**

This is what rotates old backups automatically. The `yearly/` prefix
is NOT covered by this rule → yearly snapshots kept forever.

Create a file `lifecycle.json` locally:

```json
{
  "rule": [
    {
      "action": { "type": "Delete" },
      "condition": {
        "age": 30,
        "matchesPrefix": ["daily/"]
      }
    }
  ]
}
```

Apply per school:

```bash
gcloud storage buckets update "gs://schoolconnect-nlg-backups" \
  --lifecycle-file=lifecycle.json \
  --project=schoolconnect-nlg

gcloud storage buckets update "gs://schoolconnect-mag-backups" \
  --lifecycle-file=lifecycle.json \
  --project=schoolconnect-mag
# ... per school
```

Verify:
```bash
gcloud storage buckets describe "gs://schoolconnect-nlg-backups" \
  --format="value(lifecycle)"
```

**Step 3 — Grant IAM roles to the default service account**

The Cloud Functions runtime uses `<projectId>@appspot.gserviceaccount.com`.
It needs two roles:

```bash
# For NLG:
PROJECT=schoolconnect-nlg
SA="${PROJECT}@appspot.gserviceaccount.com"

gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:${SA}" \
  --role="roles/datastore.importExportAdmin"

gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:${SA}" \
  --role="roles/storage.admin"

# Repeat per school (change PROJECT)
```

Verify:
```bash
gcloud projects get-iam-policy "$PROJECT" \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:${SA}" \
  --format="table(bindings.role)"
# Should list:
#   roles/datastore.importExportAdmin
#   roles/storage.admin
```

**Step 4 — Add BACKUP_BUCKET env var (optional, only if you
diverge from the `<projectId>-backups` naming convention)**

```bash
# functions/.env.schoolconnect-nlg   ← append if needed
BACKUP_BUCKET=schoolconnect-nlg-backups
```

If you stuck with the default naming, nothing to add — the function
falls back to `<projectId>-backups` automatically.

---

## Phase 4 — Deploy functions

**First-time deploy, per school.** Run this ONE SCHOOL AT A TIME and
verify before moving to the next.

```bash
cd ~/RT-SC

# Deploy to NLG first (pilot)
firebase deploy --only functions --project schoolconnect-nlg

# Expected output (abbreviated):
#   ✔ functions[onProfDelete(us-central1)]: Successful create operation.
#   ✔ functions[fedapayWebhook(us-central1)]: Successful create operation.
#   ✔ functions[subscriptionReminder(us-central1)]: Successful create operation.
#   ✔ functions[onPreInscriptionStatusChange(us-central1)]: Successful create operation.
#   ✔ functions[testEmail(us-central1)]: Successful create operation.
#   ✔ functions[dailyPresenceRollover(us-central1)]: Successful create operation.
#   ✔ functions[monthlyCivismePurge(us-central1)]: Successful create operation.
#   ✔ functions[weeklyStaleAbsencesCleanup(us-central1)]: Successful create operation.
#   ✔ functions[nightlyBackup(us-central1)]: Successful create operation.
#   ✔ functions[yearlySnapshotOnRollover(us-central1)]: Successful create operation.
#   ✔ functions[yearlySnapshotFallback(us-central1)]: Successful create operation.
#   Function URL (fedapayWebhook): https://us-central1-schoolconnect-nlg.cloudfunctions.net/fedapayWebhook
#   Function URL (testEmail): https://us-central1-schoolconnect-nlg.cloudfunctions.net/testEmail
```

**Note the function URL** — you need it for the next step.

If deploy fails:
- **"API has not been used"**: enable the Cloud Functions API via the link in the error
- **"Billing account required"**: go back to Phase 1, Blaze isn't active
- **Compile errors**: paste the error to Claude; the scaffold needs a fix

---

## Phase 5 — Register webhook URL in FedaPay

**Per school.** Each school's FedaPay merchant account is separate, so
you register the webhook in each one individually. You'll be logging
into the FedaPay dashboard using whichever account owns that school's
merchant profile (this may be the school's admin, the director, or
you acting on their behalf depending on how you set things up).

### 5a. Navigate to the Webhooks section

1. Go to https://live.fedapay.com/webhooks in your browser
   (or log in at https://fedapay.com and click the Webhooks menu)
2. Log in with the credentials for THIS school's FedaPay account
3. **Verify you're in the right account**: the merchant name shown
   at the top of the dashboard should match the school (e.g. "CEG
   HOUETO"). If you have multiple merchant accounts, switch via the
   account picker before proceeding.
4. You should see the Webhooks section; click **Créer un webhook**
   or **New Webhook**

### 5b. Verify you're in LIVE mode, not Sandbox

FedaPay has two environments: **Sandbox** (test) and **Live** (real).
They're served on different subdomains:
- **Live** (real payments): `https://live.fedapay.com`
- **Sandbox** (test): `https://sandbox.fedapay.com`

These have SEPARATE webhooks + SEPARATE secrets. You need the
webhook on **Live** for real payments to fire it. Double-check the
URL in your browser's address bar says `live.fedapay.com` before
creating.

If you also want a sandbox webhook for testing without real money:
- Create the webhook in sandbox too, pointing to the same function URL
- Sandbox generates a DIFFERENT secret — don't mix them up
- Test in sandbox first, then repeat in Live for production

### 5c. Create the webhook

You'll see a form titled **Créer le webhook** with these fields:

1. **URL**: paste the `fedapayWebhook` function URL from Phase 4
   deploy output. Format:
   ```
   https://us-central1-<projectId>.cloudfunctions.net/fedapayWebhook
   ```
   Example for NLG:
   ```
   https://us-central1-schoolconnect-nlg.cloudfunctions.net/fedapayWebhook
   ```

2. **Désactiver la vérification SSL sur les requêtes HTTP ?**
   → **Leave OFF** (do NOT toggle this on). Cloud Functions URLs have
   valid SSL certificates automatically. Disabling SSL verification
   would be a security downgrade for zero benefit.

3. **Désactiver le webhook lorsque l'application génère des erreurs ?**
   → **Leave OFF** (default). With this OFF, if your function goes
   down and returns errors for 10 tries in a row, FedaPay will
   auto-disable the webhook to prevent retry-queue overload. You'd
   then re-enable it manually once the function is fixed. This is
   the right safety behavior.
   If you toggled this ON, FedaPay would keep retrying forever even
   against a permanently-broken endpoint, which clogs things up.

4. **Entêtes http (Clé / Valeur)**: leave both fields empty. You
   don't need custom headers.

5. **Type d'événements**: choose the **"Sélectionner les événements
   à recevoir"** radio (NOT "Recevoir tous les événements"). A
   checklist of events will appear. Check only:
   - `transaction.approved`
   
   Our function silently ignores all other event types (pending,
   declined, refunded all log and drop), but selecting only what
   you need reduces invocation count and log noise.

6. Click **Créer**

### 5d. Copy the generated secret IMMEDIATELY

After saving, FedaPay displays the **webhook secret ONCE**. This is
the value you'll paste into `firebase functions:secrets:set
FEDAPAY_WEBHOOK_SECRET` (Phase 3b).

- The secret is a long random string (usually 32+ characters)
- It's SHOWN ONLY AT CREATION — there's no "view secret" later. If
  you lose it, you have to delete the webhook and create a new one
  (which generates a new secret and you reconfigure).
- **Copy it now**. Paste it somewhere temporary (a sticky note, a
  password manager entry, anywhere). You'll use it in Phase 3b.

### 5e. Now go set the secret on Firebase

Go back to **Phase 3b** and run:

```bash
firebase functions:secrets:set FEDAPAY_WEBHOOK_SECRET --project schoolconnect-<id>
# Paste the secret you just copied
firebase deploy --only functions:fedapayWebhook --project schoolconnect-<id>
```

After redeploy, the function loads the secret on next cold start
(within a few seconds of the next incoming webhook). At this point
the pipeline is live.

### 5f. Repeat for every school

Each school goes through all of Phase 5 + Phase 3b independently:
- Log into that school's FedaPay account
- Switch to Live mode
- Create the webhook with that school's function URL
- Copy the secret
- Set it in that school's Firebase project
- Redeploy that school's fedapayWebhook function

Don't reuse secrets across schools — each school has its own. Mixing
them up means payments won't unlock the right school.

### 5g. FedaPay retry behavior (what happens if things go wrong)

If the webhook URL returns a non-2xx response or times out, FedaPay
retries up to 9 times with exponential backoff, maxing out at about
2 minutes between tries. After 10 consecutive failures, FedaPay
auto-disables the webhook to prevent queue overload.

**If that happens**: log into the FedaPay dashboard → Webhooks →
pick the disabled webhook → re-enable it. Then go to the Logs page
of that webhook and click **Redeliver** on any failed events you
want to replay (e.g. a payment that didn't unlock the school because
the webhook was down).

---

## Phase 6 — Test the webhook with a real small payment

**Critical step — don't skip.**

**Pre-flight checklist** — before running this test, confirm all of:
- [ ] Phase 4 completed (function deployed)
- [ ] Phase 5 completed (webhook registered in FedaPay dashboard in
      Live mode, targeting your function URL)
- [ ] Phase 3b completed (`FEDAPAY_WEBHOOK_SECRET` set on Firebase
      and `fedapayWebhook` redeployed after)

If any of those are missing, the payment will happen but the webhook
either won't fire or will fail signature verification. Loop back
and finish the missing step first.

**Test sequence**:

1. Log into the school as admin
2. Deliberately force a locked state (use the vendor-app or set `isManualLock: true` in Firestore)
3. Click "Payer" on the locked page
4. Complete a real small payment via FedaPay (the amount doesn't matter — you're verifying the flow, not buying time)
5. Wait ~10 seconds
6. **Verify**:
   - The locked page should automatically unlock (subscription snapshot pushes the new deadline)
   - Firestore `/ecole/subscription.deadline` should show a new future timestamp
   - Firestore `/ecole/subscription.lastPaymentAt` should be populated
   - Cloud Functions logs should show `fedapayWebhook: deadline extended`

Check logs:
```bash
firebase functions:log --project schoolconnect-nlg --limit 20
```

If the webhook didn't fire:

1. **Check FedaPay's delivery logs first**:
   - FedaPay dashboard → Webhooks → click your webhook → **Logs** tab
   - You'll see every delivery attempt with status (200, 401, 500, etc.)
   - If NO log entry exists for the test payment: FedaPay didn't try
     to send. Check that you selected `transaction.approved` as an
     event type (Phase 5c step 3), and that you're in Live mode not
     Sandbox.
   - If log shows **401 Unauthorized**: signature mismatch. The
     secret on Firebase doesn't match the one FedaPay is signing
     with. Most likely causes:
     - You copied the secret wrong (trailing space, missing char)
     - You didn't redeploy after setting the secret (`firebase deploy
       --only functions:fedapayWebhook ...`)
     - You set the secret on the wrong project
   - If log shows **500 / timeout**: the function itself crashed.
     Look at Firebase logs for the stack trace.
2. **If the secret needs to be replaced**: FedaPay won't let you
   view the existing secret. Delete the webhook + re-create it
   (Phase 5c) — this generates a new secret. Copy it, re-set on
   Firebase (Phase 3b), redeploy.
3. **Re-deliver the missed event**: FedaPay dashboard → Webhooks →
   Logs tab → find the failed event → click **Redeliver**. This
   replays the same payload to your (now-fixed) function.

**Do NOT proceed to Phase 7 until Phase 6 works on at least one school.**

---

## Phase 6.5 — Verify email delivery (Session B)

Before trusting automated emails to reach parents and admins, confirm
the Resend pipeline end-to-end with the `testEmail` endpoint.

Get the test URL from Phase 4 deploy output. Then from any shell:

```bash
curl -X POST \
  "https://us-central1-schoolconnect-nlg.cloudfunctions.net/testEmail" \
  -H "Content-Type: application/json" \
  -d '{"to":"YOUR_EMAIL@gmail.com","secret":"<TESTEMAIL_SECRET>"}'
```

**Expected**:
- HTTP 200 with `{"ok":true,"messageId":"..."}`
- Email arrives in your inbox within ~10 seconds, subject
  "SchoolConnect — test email"
- Navy header, gold accent, readable body

**If the email doesn't arrive**:
1. Check Resend dashboard → Emails — did the send register?
   - If NO: `RESEND_API_KEY` is wrong
   - If YES but marked "failed": check the bounce reason
2. Check `firebase functions:log --project <sid>` for errors
3. If using a custom `EMAIL_FROM` domain, verify the domain is fully
   verified in Resend (DNS records can take hours to propagate)
4. Check spam folder — new sending domains often land there first;
   warming up takes a few weeks of consistent volume

**Testing the subscription reminder specifically**:

The scheduled reminder runs at midnight Bénin time. To test manually
without waiting:

```bash
# Trigger the function manually from your local shell (requires being
# logged into firebase and having admin access to the project)
firebase functions:shell --project schoolconnect-nlg
# In the shell that opens:
subscriptionReminder()
```

This runs it on-demand. To make it actually fire an email, temporarily
set the subscription deadline to 7 days from now in Firestore, then
run the function. Restore the real deadline after testing.

**Testing the pre-inscription email**:

1. Submit a test pre-inscription via the public form at
   `https://schoolconnect-<id>.web.app/inscription`
2. Include an email you own in the "Email du parent" field
3. Log into admin dashboard, go to Inscriptions tab
4. Approve or refuse the test dossier
5. Email should arrive within ~10 seconds

**Delete the `testEmail` endpoint after verification (optional)**:

Once you've confirmed everything works, `testEmail` serves no production
purpose. You can keep it (costs nothing when unused) or delete it:

```bash
firebase functions:delete testEmail --project schoolconnect-nlg --force
```

Remove the export from `functions/src/index.ts` to prevent it coming
back on the next deploy.

---

## Phase 6.6 — Verify scheduled jobs (Session C)

The scheduled functions run automatically at their configured times.
To verify they work BEFORE the first natural run, trigger each
manually:

```bash
firebase functions:shell --project schoolconnect-nlg
```

In the shell:

```js
// Daily presence rollover — should move yesterday's presences (if any) to /archived_absences
dailyPresenceRollover()

// Weekly stale absences cleanup — deletes parent-declared absences older than 14 days
weeklyStaleAbsencesCleanup()

// Monthly civisme purge — should delete old terminal-state quêtes/réclamations (if any)
monthlyCivismePurge()

// Nightly backup — kicks off an export; check GCS bucket within ~2 min
nightlyBackup()

// Yearly fallback — only meaningful test: temporarily set /ecole/config.lastArchivedAnnee to a stale value, then run. Don't forget to restore.
yearlySnapshotFallback()
```

After `nightlyBackup()`, verify the bucket:

```bash
gcloud storage ls "gs://schoolconnect-nlg-backups/daily/"
# Expect to see a YYYY-MM-DD folder that wasn't there before
```

Content inside a backup folder will be a Firestore-native export
(not human-readable). To restore:

```bash
# See https://firebase.google.com/docs/firestore/manage-data/export-import
gcloud firestore import \
  "gs://schoolconnect-nlg-backups/daily/YYYY-MM-DD/" \
  --project=schoolconnect-nlg
```

**Verify lifecycle rule (30-day rotation)**:

```bash
gcloud storage buckets describe "gs://schoolconnect-nlg-backups" \
  --format="json(lifecycle)"
# Should show a rule deleting objects >30d old under daily/
# NOT touching yearly/
```

**Verify the yearly trigger** (this one runs on rollover, not on a
schedule). When an admin runs the year rollover:
1. After `executeFinalArchive` completes, `/ecole/config.lastArchivedAnnee` is written
2. The trigger fires within seconds
3. A new folder `gs://.../yearly/<annee>/` appears in the bucket

You can verify by watching logs during a test rollover:
```bash
firebase functions:log --project schoolconnect-nlg --only yearlySnapshotOnRollover
```

---

## Phase 7 — Tighten the Firestore rules

Until now, the current (pre-Blaze) rules are still live. Admins can still F12-extend
their deadline. Now that the webhook works, lock it down:

1. Open `firestore.rules.blaze` in the repo root — read its comments
2. Merge the tightened `/ecole/subscription` block into `firestore.rules` (replace
   the existing block, keep everything else)
3. Commit:
   ```bash
   git add firestore.rules firestore.rules.blaze
   git commit -m "chore(rules): harden /ecole/subscription writes (post-Blaze)"
   git push
   ```
4. Deploy per school:
   ```bash
   ./deploy-school.sh schools/schoolconnect-nlg.json --rules-only
   ```
5. **Verify**: open DevTools as admin, try:
   ```js
   firebase.firestore().doc('ecole/subscription').update({ deadline: new Date('2099-01-01') })
   ```
   Should fail with a permission error. If it succeeds, rules didn't deploy — check `firebase deploy` output.

6. Roll out to every school.

---

## Phase 8 — Rollout to remaining schools

```bash
# Deploy functions to every school
for config in schools/*.json; do
  sid=$(basename "$config" .json)
  echo ""
  echo "═══ $sid ═══"
  firebase deploy --only functions --project "$sid"
done
```

After each, repeat Phase 5 (register webhook URL in FedaPay dashboard) and
Phase 7 (deploy hardened rules).

---

## After Blaze is live

- Future sessions (B, C, D) will add more functions: emails, scheduled jobs,
  frontend cleanup. Each comes with its own deploy section in this playbook.
- Keep the `functions/` and rules in sync. If you edit `firestore.rules`, copy
  the change into `firestore.rules.blaze` if it touches `/ecole/subscription`.
- Monitor Cloud Functions usage monthly: https://console.cloud.google.com →
  Billing → Reports. Look for anomalies (a function invoked way more than
  expected = bug).

---

## Emergency rollback

If something breaks badly after Blaze activation and you need to revert to
pre-Blaze behavior RIGHT NOW:

```bash
# 1. Un-tighten rules (restore the wider admin write)
git revert <commit-sha-of-rule-tightening>
./deploy-school.sh schools/<id>.json --rules-only

# 2. Disable functions (they'll stop responding but won't delete data)
firebase functions:delete fedapayWebhook --project <sid> --force
firebase functions:delete onProfDelete --project <sid> --force

# 3. Admins can now self-service payments again via the old client path.
```

**On the FedaPay side** (optional but tidier): after deleting the
Cloud Function, the webhook URL becomes unreachable. FedaPay will
retry 10 times per event then auto-disable the webhook. To avoid
the noise in FedaPay's logs while rolled back:
- Log into the FedaPay dashboard for each school
- Webhooks → click the webhook → **Disable** (toggle)
- When you re-enable functions later, re-enable the webhook too

Data is safe either way — nothing in this rollout deletes user data.

---

## Session E5 addendum — adding a new school (post-E5 workflow)

After E5 ships, adding a new school is mostly automated. Follow this
sequence:

### Step 1 — Create the Firebase project

Firebase Console → "Add project" → follow prompts. Note the project
ID (e.g. `schoolconnect-newschool`).

### Step 2 — Create your ops Auth account in that project

Firebase Console → Authentication → Users → Add user.
- Email: your ops email (e.g. `ludoskyazon@gmail.com`)
- Password: set a strong password

Then trigger email verification (Firebase sends a verification link;
click it in your inbox). Verified status is required for the
`setSaaSMasterClaim` callable to accept the caller.

### Step 3 — Run the onboarding script

```bash
./scripts/onboard-new-school.sh
```

The script:
- Registers the project with firebase CLI
- Creates `schools/<pid>.json` skeleton
- Creates `functions/.env.<pid>` skeleton
- Prompts for `HMAC_SECRET` (use the same value across schools)
- Optionally deploys functions

### Step 4 — Edit `functions/.env.<pid>`

Open the created file and set:
- `SAAS_MASTER_EMAILS=ludoskyazon@gmail.com` (or whatever ops email
  you used in Step 2)
- `RESEND_API_KEY` if you want email notifications

Then redeploy functions so the env var is picked up:
```bash
firebase deploy --only functions --project schoolconnect-newschool
```

### Step 5 — Upgrade the project to Blaze

Firebase Console → Usage and Billing → Modify plan → Blaze.
Set a $5/month budget alert.

### Step 6 — Bootstrap via vendor-app

- Open vendor-app in browser
- Add school → paste the Firebase config for the new project
- Log in with your ops email
- `ensureSaaSMasterClaim` fires → custom claim set → token refreshes
- Navigate to BootstrapScreen → fill the form (school name, school
  admin email, passkeys, FedaPay public key, etc) → submit
- All `/ecole/*` and `/professeurs/{adminUid}` docs get seeded in a
  batch write

### Step 7 — Deploy rules + hosting

```bash
./deploy-school.sh schools/schoolconnect-newschool.json
```

### Step 8 — Set up the FedaPay webhook

In your FedaPay dashboard (one account covers all schools):
- Settings → Webhooks → Create webhook
- URL: `https://us-central1-schoolconnect-newschool.cloudfunctions.net/fedapayWebhook`
- Event: `transaction.approved`
- FedaPay shows a signing secret — copy it

Back in terminal:
```bash
firebase functions:secrets:set FEDAPAY_WEBHOOK_SECRET --project schoolconnect-newschool
# Paste the signing secret when prompted

# Redeploy to bind the new secret
firebase deploy --only functions --project schoolconnect-newschool
```

### Step 9 — Verify

- Log in to the new school as admin (the school director's account,
  created by bootstrap)
- Try (DevTools): `setDoc on /ecole/subscription.deadline` → should
  fail with permission-denied
- Pay a sandbox FedaPay transaction tagged with this school's
  project ID in `custom_metadata.school_id` → webhook extends
  deadline → LockedPage auto-unlocks

Done. The new school is fully onboarded with the same security
posture as existing schools.

---

## How existing schools get new improvements

Each school is a separate Firebase project. When you ship improvements
to RT-SC, you need to push to each one. The standard pattern:

```bash
# Push hosting + rules to every school (run after any RT-SC code change)
for config in schools/*.json; do
  ./deploy-school.sh "$config"
done

# Push functions to every school (run after any functions/ code change)
for pid in schoolconnect-nlg schoolconnect-mag schoolconnect-houeto schoolconnect-1adfa; do
  firebase deploy --only functions --project "$pid"
done
```

The `deploy-school.sh` script handles `firestore.rules` + `hosting`
in one command (see its `--rules-only` / `--hosting-only` flags for
finer control).

For new-ish schools (added after a feature shipped), the first
deploy to them automatically includes all current code — you don't
need to "backfill" anything. That's just how Firebase deploys work:
they push whatever the current source tree contains.

Last updated: 23 April 2026 (E5).
