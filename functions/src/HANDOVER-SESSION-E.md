# Session E — Prof Security + Subscription Hardening (FINAL, E5)

Session E is now fully shipped through E5. This doc captures the
whole arc and the final post-E5 state.

Status: E1a + E1b + E2 + E3 + E4 + E5 complete. Blaze required.

---

## What each turn shipped

| Turn | Goal | Key shipping |
|---|---|---|
| E1a | Foundation of per-prof passkey login | `verifyProfLogin`, `onProfActivated`, `onProfDeleteCascade`, `onClasseDelete`, `lib/passkey.ts` HMAC helpers |
| E1b | Completion: orphan cleanup + self-service | `onEleveDeleteCascade`, `onPreInscriptionDelete`, `expireStalePasskeys`, `findEleveIdentity`, `regenerateOwnPasskey` |
| E2 | Wire client to callables, pre-Blaze fallbacks | `ProfPasskeyGate`, `EleveSignup`, `ParentLogin`, `MonProfilSection` all with dual-mode |
| E2 hotfix | Security fix + TS cleanup | Removed alreadyAuthed bypass (gate now challenges every fresh tab) |
| E3 | Rules tightening + admin migration + 4h TTL | eleves collectionGroup staff-only, professeurs credential field blocks, `regeneratePasskeyForProf`, `MigrateProfPasskeysButton` |
| E4 | Commit to Blaze: drop fallbacks + harden emails | Removed pre-Blaze paths in 5 client files, passkey never in email body |
| **E5** | **Server-side subscription enforcement + custom-claim SaaSMaster + FedaPay webhook + onboarding script** | **See below** |

---

## Session E5 — what shipped

### 1. `firestore.rules` — full rewrite

New helper functions:
- **`isActiveStaff()`** — `isStaff()` + has a prof doc + `statut == 'actif'`. Used where a disabled prof shouldn't pass checks.
- **`isActiveAdmin()`** — `isActiveStaff()` + role == 'admin'
- **`isSaaSMaster()`** — changed from UID match to custom claim: `request.auth.token.saasMaster == true`. No per-school UID hardcoding.
- **`isUnlocked()`** — returns true when `/ecole/subscription.isManualLock != true` AND `request.time < deadline + 3d grace`. Fail-safe: if the doc is missing, returns false (locked).
- **`canWriteSchoolData()`** — shorthand for `(isActiveStaff() && isUnlocked()) || isSaaSMaster()`

`/ecole/subscription` write rule — split:
- Admins: can ONLY flip `hasRequestedUnlock: true` (payment-reported signal)
- SaaSMaster: full read + create + update + delete

`/professeurs` update rule — blocked fields expanded:
- E3-era blocks preserved: `loginPasskey`, `loginPasskeyVersion`, `lastLoginAt`
- E5 added: `role`. Admins can't promote accomplices or self-promote. Role changes go through SaaSMaster (vendor-app) only.
- Self-signature write preserved (requires `isActiveStaff()` now)

`isUnlocked()` applied to every write rule that mutates school data:
- `/classes/**`, `/annonces/**`, `/annonces_globales/**`, `/school_codes/**`, `/emploisDuTemps/**`, `/seances/**`, `/annales/**`, `/vigilance_ia/**`
- `/archive/**`, `/archived_absences/**`
- `/recompenses/**`, `/quetes/**`, `/reclamations/**`, `/annuaire_parents/**`
- All subcollections of `/classes/{cid}/eleves/{eid}/**`
- `/ecole/{non-subscription}/**`, `/system/**`, `/settings_inscription/**`

NOT applied to:
- `/ecole/subscription` — otherwise you couldn't pay to unlock a locked school
- `/pre_inscriptions/**` — revenue-generating anonymous flow, still accepted during lock
- `/rv_counters/**` — pre-inscription counter, same reason
- `/professeurs` create — new signup during lock still allowed (sits in en_attente)
- `/cms/**` — SaaSMaster only anyway, no lock relevance

`preinscriptionsOpen()` default changed from OPEN to CLOSED when config doc is missing. Safer default.

Obsolete rules files removed:
- `firestore-6g.rules` (superseded by the current rules)
- `firestore-6d.rules` (historical)
- `firestore-civisme-phase1.rules` (historical)
- `🚨 SECURITY-TODO-BEFORE-DEPLOY.md` (all items now done)

### 2. New Cloud Function: `setSaaSMasterClaim`

File: `functions/src/http/setSaaSMasterClaim.ts`

HTTPS callable. Promotes the caller to SaaSMaster by setting
`{ saasMaster: true }` custom claim on their Firebase Auth user.

Authorization:
- Caller's email must be in the `SAAS_MASTER_EMAILS` env var
  (comma-separated) set in `functions/.env.<project-id>`
- `email_verified` must be true
- If `SAAS_MASTER_EMAILS` is unset or empty, ALL callers rejected (fail-safe)

**No email is hardcoded in the function source.** Each school declares
its master email(s) via env var. In practice you'll use the same ops
email across all schools, but the env-driven design means:
- Different schools can have different master emails (useful for handoff)
- Rotating the master for one school = edit `.env.<pid>` + redeploy
  functions, no code change
- Nothing baked into the compiled JS

**Workflow per school**:
1. In Firebase Console → Authentication → add an Auth account with
   your ops email (e.g. `ludoskyazon@gmail.com`) in THIS school's
   project. Make sure the email is verified.
2. In `functions/.env.<project-id>`, set
   `SAAS_MASTER_EMAILS=ludoskyazon@gmail.com`
3. Deploy functions. Vendor-app login as that email will trigger the
   callable, which sets the claim.

Idempotent: calling again is a cheap read + no-op. Safe to invoke
on every vendor-app login.

Important: the caller MUST `user.getIdToken(true)` after a successful
response so the refreshed token carries the new claim. The vendor-app
`ensureSaaSMasterClaim` helper does this automatically.

### 3. Updated Cloud Function: `fedapayWebhook`

File: `functions/src/http/fedapayWebhook.ts`

The function already existed (past-Ludosky wrote it during Phase 6g).
E5 added:

- `FedaPayEvent` type now includes `custom_metadata.school_id`
- After signature verification + approval check, the function compares
  `event.data.object.custom_metadata.school_id` against
  `process.env.GCLOUD_PROJECT`
- Mismatch or missing metadata → returns 200 + ignore (avoids FedaPay
  retry storms for school-mismatched events)

Why: one FedaPay account serves all schools. Without filtering,
every school's webhook receives every event, and would extend its
own deadline on other schools' payments.

### 4. Reverted `LockedPage.tsx` to secure path

The F12 bypass that past-Ludosky flagged in
`🚨 SECURITY-TODO-BEFORE-DEPLOY.md` is closed:

- Removed `usePayAndExtendSubscription` import + usage
- `onComplete` now flips `hasRequestedUnlock: true` only (via
  `useRequestUnlock`). Admin cannot write `deadline` from the
  client anymore.
- FedaPay widget `transaction` now includes `custom_metadata.school_id`
  so the webhook can filter events per-project.
- Success toast: "Paiement reçu ! Déblocage en cours — votre accès
  sera rétabli sous quelques instants." (UX expects webhook to
  trigger unlock within seconds)
- Removed the `navigate('/admin?paid=true')` auto-bounce. The
  SubscriptionGuard's onSnapshot listener picks up the new deadline
  and auto-redirects.
- Updated pay-section copy to say "Le déblocage est automatique après
  confirmation du paiement par FedaPay."

### 5. Vendor-app integration

`vendor-app/src/lib/saasMaster.ts` — NEW helper:
- `ensureSaaSMasterClaim(app, user)` — calls the callable, force-refreshes the ID token, returns `{ claimPresent, callableSucceeded, callableUnavailable, message }`
- `hasSaaSMasterClaim(app)` — synchronous check on the current token

`vendor-app/src/lib/bootstrap.ts`:
- `bootstrapSchool` signature now takes `(app, auth, db, input)` — app added so the function can call the claim helper
- Immediately after `createUserWithEmailAndPassword`, calls
  `ensureSaaSMasterClaim` so the batch-writes below pass the rules

`vendor-app/src/screens/LoginScreen.tsx`:
- After successful signin, calls `ensureSaaSMasterClaim` before
  transitioning to the command center
- On permission-denied or email-not-verified, surfaces a clear error

`vendor-app/src/screens/BootstrapScreen.tsx`:
- Updated the `bootstrapSchool` call to pass `firebase.app`

### 6. New onboarding script: `scripts/onboard-new-school.sh`

Bundles the CLI steps for adding a new school project:
- firebase use --add
- Create `schools/<pid>.json` skeleton
- Create `functions/.env.<pid>` skeleton
- Prompt for HMAC_SECRET (shared value across schools)
- Deploy functions
- Print manual next steps (Blaze upgrade, FedaPay webhook, bootstrap)

Can't scripts (require human):
- Blaze plan upgrade (Firebase console)
- FedaPay webhook creation (FedaPay dashboard)
- Per-school FedaPay webhook secret (paste from FedaPay into Firebase secret)

---

## Post-E5 deploy sequence (Blaze activation day)

Do this per school. First school is NLG (pilot).

```bash
# 1. Firebase console → upgrade NLG to Blaze

# 2. Set the shared HMAC secret
openssl rand -base64 48 > /tmp/hmac.txt
firebase functions:secrets:set HMAC_SECRET --project schoolconnect-nlg --data-file /tmp/hmac.txt
# (repeat the same value for every school)

# 3. Deploy functions
firebase deploy --only functions --project schoolconnect-nlg

# 4. Open vendor-app in browser:
#    - Log in with ludoskyazon@gmail.com — setSaaSMasterClaim fires
#    - Claim set + token refreshed

# 5. Deploy rules (rules require the claim to be set — do this AFTER step 4)
./deploy-school.sh --rules-only schools/schoolconnect-nlg.json

# 6. Deploy hosting (E4 + E5 client changes)
./deploy-school.sh --hosting-only schools/schoolconnect-nlg.json

# 7. Create FedaPay webhook for NLG in FedaPay dashboard:
#    https://us-central1-schoolconnect-nlg.cloudfunctions.net/fedapayWebhook
#    Copy the signing secret FedaPay gives you back

# 8. Set the webhook secret
firebase functions:secrets:set FEDAPAY_WEBHOOK_SECRET --project schoolconnect-nlg

# 9. Re-deploy functions to bind the new secret
firebase deploy --only functions --project schoolconnect-nlg

# 10. Test:
#    - Log in to RT-SC as admin
#    - Try (DevTools): setDoc on /ecole/subscription.deadline
#      → should fail with permission-denied
#    - Pay via FedaPay sandbox → webhook extends deadline
#    - Vendor-app shows updated deadline

# Repeat for each subsequent school.
rm /tmp/hmac.txt
```

## Adding a new school post-E5

The new script handles most of it:

```bash
# Create Firebase project in console first (manual)
# Then:
./scripts/onboard-new-school.sh
# Follow the prompts.

# When it finishes, do the manual steps:
# - Upgrade new school to Blaze
# - Create FedaPay webhook in FedaPay dashboard
# - Set FEDAPAY_WEBHOOK_SECRET for new school
# - Bootstrap via vendor-app (Login with ludoskyazon@gmail.com,
#   then BootstrapScreen, submit form)
# - ./deploy-school.sh schools/<new-pid>.json (full deploy)
```

No rules editing, no UID hunting, no code changes. The custom claim
approach makes the new-school flow mostly GUI-driven.

## Getting new improvements onto existing schools

Existing schools don't auto-update. After an RT-SC code change:

```bash
# Quick one-liner to push hosting + rules to all schools
for config in schools/*.json; do
  ./deploy-school.sh "$config"
done

# Or functions only
for pid in schoolconnect-nlg schoolconnect-mag schoolconnect-houeto schoolconnect-1adfa; do
  firebase deploy --only functions --project "$pid"
done
```

---

## F12 defenses — what's now enforced server-side

Post-E5:

| Attack | Defense | Where |
|---|---|---|
| Extend own subscription via DevTools `setDoc` | Rule rejects: only SaaSMaster writes `deadline` | firestore.rules line ~170 |
| Flip off `isManualLock` via DevTools | Rule rejects: only SaaSMaster writes `isManualLock` | same |
| Work around a locked school by skipping SubscriptionGuard | Rule rejects: every write requires `isUnlocked()` | firestore.rules (everywhere) |
| Promote self to admin via DevTools | Rule rejects: `role` blocked from admin updates | firestore.rules line ~385 |
| Stamp own passkey to a known value | Rule rejects: Session E credential fields blocked | firestore.rules same block |
| Scan eleves collectionGroup from client | Rule rejects: staff-only | firestore.rules line ~55 |
| Spoof FedaPay webhook | Server rejects: HMAC signature verification | fedapayWebhook.ts |
| Trigger another school's deadline extension via shared FedaPay account | Server ignores: school_id metadata filter | fedapayWebhook.ts |

### What's still not enforced server-side (accepted risk)

- A rogue admin with real credentials can desactivate other admins. SaaSMaster (vendor-app) is the recovery path.
- `rv_counters` is world-writable. Low-stakes data; moving to server-side would need a Cloud Function, deferred.
- Signed-in anonymous users (éleves) can claim another éleve's session via F12 IF they know the classeId + eleveId. Moving to Cloud Function mint-custom-token flow is deferred (Phase 6g turn 1 notes it as medium priority).

These three are the remaining gaps. Not in Session E scope. Potentially a future Session F if needed.

---

## Rollback procedures

### Rules only
```bash
git revert <E5-rules-commit-sha>
./deploy-school.sh --rules-only schools/<sid>.json
```
Restores pre-E5 rules. SaaSMaster by UID again. F12 extension of deadline possible again. Only useful if the custom claim isn't working for some reason.

### setSaaSMasterClaim + vendor-app
```bash
git revert <E5-vendor-app-commit-sha>
# Redeploy vendor-app (separate from RT-SC hosting)
```
Vendor-app reverts to pre-E5 state. But rules are still E5 unless reverted separately, so without the claim, vendor-app writes fail. Pair with rules rollback for clean rollback.

### LockedPage
```bash
git revert <E5-lockedpage-commit-sha>
./deploy-school.sh --hosting-only schools/<sid>.json
```
Restores the F12-bypassable flow. Don't do this unless absolutely necessary — combine with rules rollback.

### Everything
Revert the whole E5 commit on main. Redeploy everywhere. Subscription enforcement degrades to client-side only.

---

Last updated: 23 April 2026 — E5 complete, ready for Blaze activation.
