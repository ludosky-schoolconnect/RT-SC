# Session E — Prof Security + Orphan Cleanup (HANDOVER)

**Purpose**: server-side foundation for per-prof login passkeys, plus
Firestore trigger-based orphan cleanup for deletions the client misses.

**Deployment state**: E1a + E1b shipped. E2, E3 pending.
All pending work is Blaze-deployable; nothing activates until Blaze is on.

---

## What shipped in E1a (prev session)

### Blaze-dormant (6 files in `functions/src/`)

| File | Role |
|---|---|
| `lib/passkey.ts` | Helpers: 6-digit generator, HMAC sign/verify, rate limiter |
| `http/verifyProfLogin.ts` | HTTPS callable: email+passkey → HMAC token |
| `triggers/onProfActivated.ts` | Generates loginPasskey + emails it when statut en_attente→actif |
| `triggers/onProfDeleteCascade.ts` | Cleans matieresProfesseurs, notes.professeurId, colles.donneParProfId |
| `triggers/onClasseDelete.ts` | Cleans presences, publications, emploisDuTemps, coefficients_{cid} |

### Client changes (immediate, non-Blaze)

- `src/types/models.ts` — dropped rotation fields; added loginPasskey, loginPasskeyVersion, lastLoginAt on Professeur
- `src/hooks/useProfsMutations.ts` — removed rotation timestamp writes (hotfix re-added useUpdateOwnProfSignature)
- `src/routes/admin/tabs/profs/PasskeyProfPanel.tsx` — removed rotation UI theater

---

## What shipped in E1b (THIS session)

### Blaze-dormant (5 files in `functions/src/`)

| File | Role |
|---|---|
| `triggers/onEleveDeleteCascade.ts` | Safety-net éleve subcollection cleanup + annuaire_parents by eleveId + quete claims by eleveId |
| `triggers/onPreInscriptionDelete.ts` | Deletes documents/* subcollection (inline base64, no Storage to clean) |
| `scheduled/expireStalePasskeys.ts` | Weekly Sunday 03:00 — clears loginPasskey on profs inactive 90+ days + emails nudge |
| `http/findEleveIdentity.ts` | HTTPS callable replacing unauthenticated collectionGroup(eleves) scans in éleve signup + parent login |
| `http/regenerateOwnPasskey.ts` | HTTPS callable: authenticated prof rotates their own loginPasskey |

### Skipped (upon investigation)

- **`onAnnaleDelete`** — annales store Google Drive URLs, not Firebase Storage. Nothing to orphan.
- **`onAnnuaireParentDelete`** — AnnuaireParent has no back-ref on the Eleve doc. Direction is one-way (AnnuaireParent.eleveId → Eleve), so annuaire deletions don't orphan anything.

### Index updates

`functions/src/index.ts` gained a `// ── Session E1b` section exporting all 5 new functions.

---

## What is NOT yet built

### E2 — client callable wiring + fallback (~6 files)

All client-side. Each surface tries the Blaze callable first; on
`unavailable` / `functions/not-found` error, falls back to current
pre-Blaze behavior. Once Blaze is on, callables succeed and fallback
is silently skipped (dead else branch).

**Pattern for all four client surfaces**:
```ts
try {
  const res = await httpsCallable<InputT, OutputT>(functions, 'callableName')(args)
  // Use res.data
} catch (err: unknown) {
  const code = (err as { code?: string })?.code
  // Blaze not deployed yet or function rejected: fall back
  if (code === 'functions/unavailable' || code === 'functions/not-found' || code === 'unavailable' || code === 'not-found') {
    // Legacy path (current code)
  } else {
    throw err // genuine error, surface to user
  }
}
```

**Files to modify**:

1. **`src/routes/auth/ProfPasskeyGate.tsx`**:
   - Add `email` input field alongside existing passkey field
   - Call `httpsCallable('verifyProfLogin')({ email, passkey })`
   - On success: store `{ token, expiresAt, uid }` in sessionStorage under `GATE_KEY` (already defined in the component)
   - On `unauthenticated` code: show "Email ou code incorrect" (generic)
   - On `resource-exhausted`: show "Trop de tentatives, réessayez dans quelques minutes"
   - On `unavailable`/`not-found`: FALL BACK to current school-wide `passkeyProf` compare (legacy behavior preserved)
   - Gate expiry: on every reload, if stored `expiresAt < Date.now()`, re-prompt

2. **`src/routes/auth/EleveSignup.tsx`**:
   - Replace the current collectionGroup query block (~line 60-80) with:
     ```ts
     const res = await httpsCallable('findEleveIdentity')({
       mode: 'byIdentity',
       nom: cleanNom,
       genre,
       dateNaissance,
     })
     // res.data.match is { eleveId, classeId } | null
     ```
   - Fallback: current collectionGroup query (in a try/catch on the callable)
   - Then read the actual éleve doc directly to get PIN info

3. **`src/routes/auth/ParentLogin.tsx`**:
   - Same pattern with `{ mode: 'byParentPasskey', passkey }`
   - Fallback: current `where('passkeyParent', '==', cleaned)` collectionGroup query

4. **`src/routes/prof/tabs/profil/MonProfilSection.tsx`**:
   - Add a "Régénérer mon code de connexion" button with confirm modal
   - On click: `httpsCallable('regenerateOwnPasskey')()`
   - Response includes `{ ok, passkey }` — show the new passkey in a modal copy-box (big mono font like the PasskeyProfPanel style) with a toast "Un email avec le nouveau code vient d'être envoyé"
   - Warn: "Cette action déconnectera toutes vos autres sessions."

5. **Optional: `src/firebase.ts`** — ensure `getFunctions(app, 'us-central1')` is exported if not already. Check: grep for `getFunctions` in existing client code.

6. **Update `DEPLOY-ONCE-BLAZE-IS-READY.md`** — add a Session E2 subsection under Phase 3e/6.6 describing the new smoke tests (callable calls from devtools).

### E3 — rules tightening + admin migration button

1. **`firestore.rules`**:
   - `/{path=**}/eleves/{eleveId}` collectionGroup read — change
     `allow read: if true` → `allow read: if request.auth != null && isStaff()`
     Safe now because E2 routes unauthenticated lookups through
     `findEleveIdentity` callable (admin SDK bypasses rules).
   - Restrict `/professeurs/{uid}.loginPasskey` + `.lastLoginAt` +
     `.loginPasskeyVersion` fields to admin + self only. This is
     non-trivial because Firestore rules don't have field-level
     read restrictions — instead, the client must NOT query these
     fields directly. Since the client only reads them via the
     `verifyProfLogin` callable (server-side), no client read path
     actually needs them. So the rule becomes:
     ```
     match /professeurs/{uid} {
       allow read: if request.auth != null && (request.auth.uid == uid || isStaff());
       // writes stay as-is but block client-direct writes to loginPasskey etc.
       allow update: if ... && !request.resource.data.diff(resource.data).affectedKeys().hasAny(['loginPasskey', 'loginPasskeyVersion', 'lastLoginAt']);
     }
     ```
     Server-side writes (admin SDK in callables/triggers) bypass rules.

2. **Admin migration UI — "Générer les codes manquants"**:
   - New button in `AdminDashboard` → Profs tab (near the PasskeyProfPanel)
   - Iterates active profs where `loginPasskey` is missing / empty
   - For each, calls a new admin-only callable `regeneratePasskeyForProf({ profId })` that re-runs the onProfActivated logic (generate passkey, stamp, email)
   - Shows progress "N / Total profs regénérés"
   - Safe to re-run (idempotent via existence check)
   - Add the new callable to E3's file list

3. **Update `DEPLOY-ONCE-BLAZE-IS-READY.md`** with E3 rule deploy step and migration button usage.

---

## Critical conventions (match when writing E2/E3)

- **File-top JSDoc**: purpose, invariants, idempotency, what NOT done
- **Imports**: `firebase-admin/*`, `firebase-functions/v2/*`, `node:crypto`
- **Error handling**: structured log context, rethrow only when retry helps
- **Idempotency guards**: "already done?" checks everywhere
- **Session labels in comments**: `// Session E1a`, `// Session E1b`, etc.
- **HMAC_SECRET**: any function using it declares `secrets: [HMAC_SECRET]`
- **Rate limiting**: reuse `checkRateLimit`/`clearRateLimit` from `lib/passkey.ts` or inline equivalents for specific tuning

---

## Key architectural decisions

1. **Separate trigger for onProfDeleteCascade vs onProfDelete**:
   Two Firestore triggers can listen to the same doc event. Keep
   separate so failure in one doesn't block the other (Auth cleanup
   proceeds regardless of orphan cleanup outcome).

2. **Plaintext passkey storage**: 6 digits is short enough that
   hashing adds no real security value. Rely on rate limiter + rules
   restricting who can READ the field.

3. **HMAC payload.v (passkeyVersion)**: bumping on rotation
   invalidates all existing tokens (they were signed with the old
   v). Logs out every session without maintaining a token blacklist.

4. **Client-side fallbacks in E2**: preserve pre-Blaze behavior.
   Pre-Blaze: callable doesn't exist → fallback runs → everything
   works as today. Post-Blaze: callable succeeds first → fallback
   is dead code. Schedule fallback removal for late 2026 once Blaze
   proven stable.

5. **Why onProfActivated not onProfCreate**: en_attente profs
   can't log in yet; admin approval is the natural moment for
   credential issuance. Cleanly separates signup (unauthenticated)
   from credential issuance (authenticated admin action).

6. **findEleveIdentity returns ONLY { eleveId, classeId }**: the
   client then reads the éleve doc via a direct path (which goes
   through the per-doc read rule, at which point the client has
   already anon-signed-in). This pattern preserves existing rules
   while closing the collectionGroup scan hole.

---

## Secrets & env vars needed

Before deploying Session E functions:

```bash
# Same secret across all schools — used to sign login tokens
openssl rand -base64 48 > /tmp/hmac-secret.txt

for sid in schoolconnect-nlg schoolconnect-mag schoolconnect-houeto schoolconnect-1adfa; do
  firebase functions:secrets:set HMAC_SECRET --project "$sid" --data-file /tmp/hmac-secret.txt
done

rm /tmp/hmac-secret.txt
```

Already-existing secrets `RESEND_API_KEY` is reused by
`onProfActivated`, `expireStalePasskeys`, and `regenerateOwnPasskey`
for the various email notifications.

---

## Risk & rollback

- **E1a client changes** (rotation theater removal) are effectively
  irreversible — `passkeyProfRotatedAt` timestamps may linger on
  `/ecole/securite` docs. Harmless orphan fields; ignore.

- **Blaze deploy of E1a+E1b functions**: nothing can fire pre-deploy
  (functions don't exist). Post-deploy:
    - `verifyProfLogin` + `findEleveIdentity` + `regenerateOwnPasskey`
      are no-ops until E2 client wires them
    - `onProfActivated` fires on next admin approval
    - Cascade triggers fire on next delete
    - `expireStalePasskeys` fires next Sunday 03:00
    - None harm existing data. All re-runnable.

- **Emergency rollback**:
  ```bash
  firebase functions:delete onProfActivated --project <sid> --force
  firebase functions:delete onProfDeleteCascade --project <sid> --force
  firebase functions:delete onClasseDelete --project <sid> --force
  firebase functions:delete onEleveDeleteCascade --project <sid> --force
  firebase functions:delete onPreInscriptionDelete --project <sid> --force
  firebase functions:delete expireStalePasskeys --project <sid> --force
  firebase functions:delete verifyProfLogin --project <sid> --force
  firebase functions:delete findEleveIdentity --project <sid> --force
  firebase functions:delete regenerateOwnPasskey --project <sid> --force
  ```

---

## Testing checklist (once Blaze is on)

From `firebase functions:shell --project schoolconnect-nlg`:

```js
// Fake approval
onProfActivated({
  params: { uid: 'test-uid' },
  data: {
    before: { data: () => ({ statut: 'en_attente', email: 'test@ex.com', nom: 'Test' }) },
    after:  { data: () => ({ statut: 'actif',     email: 'test@ex.com', nom: 'Test' }) },
  },
})

// Lookup
findEleveIdentity({
  data: { mode: 'byIdentity', nom: 'Jean Dupont', genre: 'M', dateNaissance: '2010-03-15' }
})

// Rotation
regenerateOwnPasskey({
  auth: { uid: 'some-actif-prof-uid' },
  data: {}
})

// Cascade
onEleveDeleteCascade({ params: { classeId: 'test', eleveId: 'fake' } })  // no-op, logs cleanly

// Expiration — trigger the schedule manually
expireStalePasskeys()  // logs count + cleans docs older than 90d
```

Real sandbox test path:
1. Create sandbox school, activate Blaze, deploy functions
2. Sign up fake prof → admin approves → check email arrives with 6-digit code + passkey stamped on doc
3. Log out, return to login page → gate prompts email + passkey → verify callable issues token
4. Delete that prof → verify `notes.professeurId` cleared across existing docs
5. Delete a test class → verify `/emploisDuTemps/{cid}/seances/*` cleared
6. Delete a test éleve → verify `/annuaire_parents/{eleveId}_parent1` and `..._parent2` gone

---

## Where to resume

**Next session's first action**: say "build E2" to continue.
Reference this file.

E2 output will be:
- Modified `ProfPasskeyGate.tsx` (add email field + callable + fallback)
- Modified `EleveSignup.tsx` (callable + fallback)
- Modified `ParentLogin.tsx` (callable + fallback)
- Modified `MonProfilSection.tsx` (self-regenerate button + modal)
- Maybe modified `src/firebase.ts` (export getFunctions if missing)

Then E3: rules + admin migration button + closing documentation.

Last updated: 23 April 2026 — Session E1b complete.
