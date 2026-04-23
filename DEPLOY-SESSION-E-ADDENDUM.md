# Session E Deployment — Addendum to `DEPLOY-ONCE-BLAZE-IS-READY.md`

Append this content to the main Blaze playbook, after Phase 3d (backup
bucket + IAM). Insert as **Phase 3e**.

---

## Phase 3e — Session E (prof passkey + orphan cleanup)

Session E adds four Cloud Functions (E1a) with more planned in E1b/E2/E3:

- `verifyProfLogin` — HTTPS callable
- `onProfActivated` — Firestore trigger
- `onProfDeleteCascade` — Firestore trigger
- `onClasseDelete` — Firestore trigger

### 3e.1 — Set the HMAC secret (per school)

The `verifyProfLogin` callable signs session tokens with HMAC-SHA256.
Use the SAME secret across all schools so admins don't have to manage
N different secrets.

```bash
# Generate a strong random secret once
openssl rand -base64 48 > /tmp/hmac-secret.txt
# Example output (don't use this — generate your own):
#   k3n8M2pQ9wR4tY7vXz6cA1bE5fG0hJ...

# Set it per school
for sid in schoolconnect-nlg schoolconnect-mag schoolconnect-houeto schoolconnect-1adfa; do
  firebase functions:secrets:set HMAC_SECRET --project "$sid" --data-file /tmp/hmac-secret.txt
done

# Clean up — the secret is now encrypted at rest in GCP Secret Manager
rm /tmp/hmac-secret.txt
```

The `onProfActivated` trigger reuses the already-configured
`RESEND_API_KEY` secret (from Session B). Nothing new needed there.

### 3e.2 — Deploy the Session E functions

After Phase 4 deploys all functions, Session E's are included.
Verify from the deploy output that all 4 new functions appeared.

### 3e.3 — Verify Session E post-deploy

From `firebase functions:shell --project schoolconnect-nlg`, test:

```js
// Should return 'unauthenticated' for a bad passkey
verifyProfLogin({
  auth: null,
  data: { email: 'nonexistent@test.com', passkey: '000000' }
})

// Should log starting/done for a non-existent uid (no-op cleanup)
onProfDeleteCascade({ params: { uid: 'fake-uid' } })
```

Real test: in the sandbox school, approve a pending prof. Within
seconds, a `loginPasskey` should appear on their `/professeurs/{uid}`
doc AND they should get an email with the code.

### 3e.4 — Migration for existing active profs

Profs who were already `actif` before Session E deployed won't
auto-receive a passkey (the trigger only fires on transitions from
`en_attente → actif`). They need backfill.

Option A (until E3 ships the admin button): manually trigger via
firebase shell per prof:
```js
// Pretend the prof just transitioned. This re-runs onProfActivated.
const db = admin.firestore()
const uid = 'target-prof-uid'
await db.doc(`professeurs/${uid}`).update({
  statut: 'en_attente'
})
await new Promise(r => setTimeout(r, 1000))
await db.doc(`professeurs/${uid}`).update({
  statut: 'actif'
})
// onProfActivated fires on the transition, stamps passkey, emails.
```

Option B (recommended, after E3): use the admin "Générer les codes
manquants" button in the Profs tab. Iterates and handles all in one
go.

### 3e.5 — What to check on deploy day

- [ ] HMAC_SECRET set per school
- [ ] All 4 Session E1a functions visible in `firebase functions:list`
- [ ] Test prof approval → email arrives → code works when typed
- [ ] Test prof delete → `classes.matieresProfesseurs` map cleaned
- [ ] Test class delete → `/emploisDuTemps/{cid}/seances/*` gone

---

Once E1b/E2/E3 ship, this section will expand with additional
verification steps for the remaining triggers and client flows.
