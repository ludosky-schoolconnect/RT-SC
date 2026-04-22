# Blaze Activation Playbook

**Read this the day you flip Blaze on.** Step by step, with exact commands.
Don't skip ahead — some steps depend on prior state.

---

## Prerequisites

- [ ] You have a valid payment method registered in Google Cloud Billing
- [ ] You have created an account at https://resend.com (free tier) if doing emails (Session B+)
- [ ] You have FedaPay webhook secrets for each school (see "Per-school secrets" below)

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

### 3a. Get the webhook secret from FedaPay

1. Log into the school's FedaPay dashboard
2. Settings → API → Webhook secrets
3. Click "Generate new secret" (or copy an existing one)
4. Copy the value — you'll paste it in the next step

### 3b. Set the secret in Firebase

```bash
# For NLG:
firebase functions:secrets:set FEDAPAY_WEBHOOK_SECRET --project schoolconnect-nlg
# Paste the secret when prompted. It's stored encrypted at rest.

# Repeat for each school:
firebase functions:secrets:set FEDAPAY_WEBHOOK_SECRET --project schoolconnect-mag
firebase functions:secrets:set FEDAPAY_WEBHOOK_SECRET --project schoolconnect-houeto
# ... etc for every school
```

### 3c. (When you add email) Set Resend key

Once you activate Session B (emails), you'll also need:

```bash
# Single shared Resend API key across all school projects (one Resend account)
firebase functions:secrets:set RESEND_API_KEY --project schoolconnect-nlg
firebase functions:secrets:set RESEND_API_KEY --project schoolconnect-mag
firebase functions:secrets:set RESEND_API_KEY --project schoolconnect-houeto

# Set EMAIL_FROM env var (not a secret, just config)
firebase functions:config:set email.from="SchoolConnect <no-reply@schoolconnect.bj>" --project schoolconnect-nlg
# Repeat per school
```

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
#   Function URL (fedapayWebhook): https://us-central1-schoolconnect-nlg.cloudfunctions.net/fedapayWebhook
```

**Note the function URL** — you need it for the next step.

If deploy fails:
- **"API has not been used"**: enable the Cloud Functions API via the link in the error
- **"Billing account required"**: go back to Phase 1, Blaze isn't active
- **Compile errors**: paste the error to Claude; the scaffold needs a fix

---

## Phase 5 — Register webhook URL in FedaPay

**Per school.** For each school:

1. Log into that school's FedaPay dashboard
2. Settings → Webhooks → Add webhook
3. URL: paste the function URL from Phase 4
   (e.g. `https://us-central1-schoolconnect-nlg.cloudfunctions.net/fedapayWebhook`)
4. Events: select at least `transaction.approved`
5. Save

---

## Phase 6 — Test the webhook with a real small payment

**Critical step — don't skip.**

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
- Check FedaPay dashboard → Webhooks → Deliveries (did FedaPay try to POST?)
- Check Cloud Functions logs for signature verification failures
- Confirm the secret in Phase 3 matches the one in FedaPay dashboard EXACTLY

**Do NOT proceed to Phase 7 until Phase 6 works on at least one school.**

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

Data is safe either way — nothing in this rollout deletes user data.
