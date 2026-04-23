# Session E — Prof Security + Orphan Cleanup (HANDOVER)

**Purpose**: server-side foundation for per-prof login passkeys, plus
Firestore trigger-based orphan cleanup for deletions the client misses.

**Deployment state**: E1a shipped. E1b, E2, E3 pending. All pending
work is Blaze-deployable; nothing here activates until Blaze is on.

---

## Why this exists

The pre-E setup had two problems:

**Problem 1: Fake security theater.** The "weekly rotation" UI
(`passkeyProfRotatedAt` + amber-tint nudge) implied enforcement but
nothing actually forced rotation. A dismissed nag. Also, the school-
wide shared passkey meant one leak compromised every prof.

**Problem 2: Orphan data.** Several client-side delete paths don't
cascade all subcollections. Biggest offenders are `useDeleteClasse`
(missing presences, publications, emploisDuTemps) and `useDeleteProf`
(missing matieresProfesseurs map + notes/colles author refs). Over
years of class/staff churn, this would accumulate orphaned docs
burning Firestore storage cost.

**E solves both** by:
- Per-prof `loginPasskey` auto-generated on admin approval, emailed
  once, verified server-side via `verifyProfLogin` callable with HMAC
  token return (12h TTL)
- Dedicated Firestore triggers for each deletion type that cascades
  what the client misses

---

## What shipped in E1a (THIS session)

### Blaze-dormant (9 new files in `functions/src/`)

| File | Role |
|---|---|
| `lib/passkey.ts` | Helpers: 6-digit generator, HMAC sign/verify, rate limiter |
| `http/verifyProfLogin.ts` | HTTPS callable: email+passkey → HMAC token |
| `triggers/onProfActivated.ts` | Generates loginPasskey + emails it when statut en_attente→actif |
| `triggers/onProfDeleteCascade.ts` | Cleans matieresProfesseurs, notes.professeurId, colles.donneParProfId |
| `triggers/onClasseDelete.ts` | Cleans presences, publications, emploisDuTemps, coefficients_{cid} |
| `index.ts` | Exports the 4 new functions |

### Client changes (immediate, non-Blaze)

| File | Change |
|---|---|
| `src/types/models.ts` | Dropped `passkeyProfRotatedAt` + `passkeyCaisseRotatedAt` from SecuriteConfig; added `loginPasskey`, `loginPasskeyVersion`, `lastLoginAt` to Professeur |
| `src/hooks/useProfsMutations.ts` | Removed rotation timestamp writes from useRegeneratePasskeyProf/Caisse; dropped unused serverTimestamp import |
| `src/routes/admin/tabs/profs/PasskeyProfPanel.tsx` | Removed `formatRotationAge` helper + Clock/Timestamp imports + both rotation display blocks; updated doc comment explaining signup-only role |

---

## What is NOT yet built

### E1b — remaining orphan triggers (~4 files)

Must be built next session. Each is a Firestore `onDocumentDeleted`
trigger modeled on `onClasseDelete`.

1. **`triggers/onEleveDeleteCascade.ts`**
   - Safety net for per-élève subcol cleanup if client cascade failed
     partway (network drop, etc.)
   - Cleans: `notes/colles/absences/bulletins/paiements/civismeHistory`
     subcols under the deleted élève's path (re-deletes any leftovers)
   - Clears `eleveId` from `/annuaire_parents/*` back-refs (check
     `eleveId1`, `eleveId2` fields and null them)
   - Deletes active claims in `/quetes/*/claims/*` that reference
     this eleveId via `where('eleveId', '==', ...)` collectionGroup query

2. **`triggers/onPreInscriptionDelete.ts`**
   - Deletes `/pre_inscriptions/{id}/docs/*` subcollection
   - Deletes Storage files: each doc in the subcol has a `storagePath`
     field; use `admin.storage().bucket().file(path).delete()`
   - Check `inscription-doc-storage.ts` on the client for the exact
     storage path pattern before writing server-side deletes

3. **`triggers/onAnnuaireParentDelete.ts`**
   - Fires on `/annuaire_parents/{id}` delete
   - collectionGroup query on `eleves` where `annuaireParentId1 == {id}` → null it
   - Same for `annuaireParentId2`

4. **`triggers/onAnnaleDelete.ts`**
   - Fires on `/annales/{id}` delete
   - Read the annale doc's `storagePath` in the BEFORE snapshot
   - Delete the Storage file

Export all four from `functions/src/index.ts` under a `// ── Session E1b` section.

Add a `scheduled/expireStalePasskeys.ts` here too:
   - Cron: weekly Sunday 03:00 Africa/Porto-Novo
   - Query professeurs where statut='actif' AND lastLoginAt < now-90d
   - For each: clear `loginPasskey`, bump `loginPasskeyVersion`, email
     nudge ("your code was retired due to inactivity, request a new
     one from admin")

### E2 — client callable wiring + fallback

All client-side. Each surface tries the Blaze callable first; on
`unavailable` / `not-found` error, falls back to current pre-Blaze
behavior. Once Blaze is on, callables succeed and fallback is
silently skipped (dead else branch, no security issue).

1. **`src/routes/auth/ProfPasskeyGate.tsx`** (already exists — update):
   - Add email input field alongside the passkey field
   - On submit: `httpsCallable('verifyProfLogin')({ email, passkey })`
   - On success: store `{ token, expiresAt, uid }` in sessionStorage
   - On `functions/unavailable` / network error: fall back to current
     school-wide `passkeyProf` compare (legacy path, delete in E3 once
     Blaze is stable)
   - Gate check reads sessionStorage; if `expiresAt < now`, re-prompt

2. **`src/routes/auth/EleveSignup.tsx`**:
   - Call `findEleveIdentity({ mode: 'byIdentity', nom, genre, dateNaissance })`
   - Fallback: current collectionGroup query

3. **`src/routes/auth/ParentLogin.tsx`**:
   - Call `findEleveIdentity({ mode: 'byParentPasskey', passkey })`
   - Fallback: current collectionGroup query

4. **`src/routes/prof/tabs/profil/MonProfilSection.tsx`**:
   - Add "Régénérer mon code de connexion" button
   - Calls `regenerateOwnPasskey()` (new callable from E1b)
   - On success toast "Un nouveau code vous a été envoyé par email"

New callables needed (add to E1b or E2, either is fine):
- `findEleveIdentity` (HTTPS callable, unauthenticated OK)
- `regenerateOwnPasskey` (HTTPS callable, authenticated — uses
  context.auth.uid to find the prof doc)

### E3 — rules tightening + admin migration button

1. **`firestore.rules`**:
   - `/{path=**}/eleves/{eleveId}` — tighten `allow read: if true`
     to `allow read: if request.auth != null && isStaff()`. Safe
     because E2 routed identity lookup through `findEleveIdentity`
     callable (admin SDK, bypasses rules).
   - `/professeurs/{uid}.loginPasskey` — add to the list of fields
     readable only by admin or self
   - `/professeurs/{uid}.lastLoginAt` — same
   - `/professeurs/{uid}.loginPasskeyVersion` — same

2. **Admin migration UI** — one-time button "Générer les codes
   manquants" in AdminDashboard → Profs tab:
   - Iterates active profs where `loginPasskey` is missing
   - For each, triggers `onProfActivated` logic manually (stamps
     passkey, emails them) by calling a new `regeneratePasskeyForProf`
     admin-only callable
   - Shows progress per prof; safe to re-run (idempotency via the
     "already has passkey" check)

3. **Update `DEPLOY-ONCE-BLAZE-IS-READY.md`** with the Session E
   sections (already started in E1a — keep extending).

---

## Critical conventions to match

All already followed in E1a files — pattern-check against these when
writing E1b/E2/E3:

- **File-top JSDoc**: explains purpose, invariants, side effects,
  idempotency, what it deliberately does NOT do. Match the tone
  of `yearlySnapshotFallback.ts` and `fedapayWebhook.ts`.
- **Imports**: `firebase-admin/*` for admin SDK, `firebase-functions/v2/*`
  for trigger wrappers, `node:crypto` for HMAC (no external crypto lib).
- **Error handling**: log with structured context (`{ uid, classeId,
  err: msg }`), re-throw only when retry could help (the trigger
  runtime auto-retries with backoff). Never throw for things retries
  won't fix (email bounce, auth-user-not-found).
- **Idempotency**: every trigger must be safe to re-run. Use
  "already done?" guards (like `if (after.loginPasskey) return`).
- **Session labels in comments**: mark new blocks with `// Session E1a`
  or `// Session E1b` etc. Easier to audit later.
- **HMAC_SECRET**: any function using it must declare
  `secrets: [HMAC_SECRET]` in its onCall/onDocumentUpdated config.
- **Rate limiting**: for new callables, use the `checkRateLimit` /
  `clearRateLimit` helpers from `lib/passkey.ts` or write similar
  per-function limiters.

---

## Key architectural decisions (non-obvious)

1. **Separate trigger for onProfDeleteCascade vs onProfDelete**:
   Two Firestore triggers can listen to the same document event. We
   keep them separate because (a) onProfDelete is minimal and proven
   (Session A), (b) if the cascade fails, Auth account cleanup still
   happens. Single-responsibility.

2. **plaintext passkey storage**: 6 digits is short enough that
   hashing adds no real security value — a leaked hash is cracked in
   seconds on any machine. We rely on (a) rate limiter, (b) rules
   restricting who can READ the field.

3. **HMAC payload.v (passkeyVersion)**: bumping the version on
   rotation invalidates ALL existing tokens (they were signed with
   the old v). This is how we log out every session of a prof when
   they regenerate their passkey — without maintaining a token
   blacklist.

4. **Client-side fallbacks in E2**: they preserve pre-Blaze behavior.
   Pre-Blaze, callables don't exist, fallback runs, everything works
   as today. Post-Blaze, callable succeeds first, fallback is dead
   code. Schedule fallback removal for late 2026 once Blaze is
   proven stable.

5. **Why onProfActivated and not onProfCreate**: en_attente profs
   shouldn't get a passkey (they can't log in yet). Admin approving
   them is the natural "welcome to staff" moment. Also cleanly
   separates signup (unauthenticated) from credential issuance
   (authenticated admin action).

---

## Secrets & env vars needed

Before deploying Session E functions:

```bash
# Same secret across all schools — used to sign login tokens
firebase functions:secrets:set HMAC_SECRET --project schoolconnect-nlg
# Paste a random string ≥ 32 bytes. Generate with:
#   openssl rand -base64 48
# Same value for every school.

# Repeat per school
firebase functions:secrets:set HMAC_SECRET --project schoolconnect-mag
# ... etc
```

Already-existing secrets `RESEND_API_KEY` is reused by `onProfActivated`
for the welcome-passkey email.

---

## Risk & rollback

- **E1a client changes** (rotation theater removal) are irreversible
  via normal git revert — admins who had `passkeyProfRotatedAt` stamped
  on their `/ecole/securite` docs will keep those timestamps in
  Firestore (orphan fields). Harmless; ignore. If aesthetic cleanup
  is desired later, write a one-time Cloud Function or admin SDK
  script to `FieldValue.delete()` those fields across all school
  projects.

- **Blaze deploy of E1a functions** introduces no behavior change if
  they go un-invoked. The only thing that can fire pre-deploy is
  nothing (functions don't exist). Post-deploy:
    - `verifyProfLogin` is a no-op until the client (E2) calls it
    - `onProfActivated` fires on next admin approval → generates
      passkey + emails. If a prof has already been approved pre-E,
      they won't get one automatically — use the E3 migration button
      (or wait until their next rotation).
    - `onProfDeleteCascade` and `onClasseDelete` fire on next delete.
      Safe.

- **Emergency rollback** (if any E1a trigger misbehaves):
  ```bash
  firebase functions:delete onProfActivated --project <sid> --force
  firebase functions:delete onProfDeleteCascade --project <sid> --force
  firebase functions:delete onClasseDelete --project <sid> --force
  firebase functions:delete verifyProfLogin --project <sid> --force
  ```
  None write to user-critical data in ways reverting loses. Orphans
  resurface but that's the pre-E state.

---

## Testing checklist (once Blaze is on)

From `DEPLOY-ONCE-BLAZE-IS-READY.md` Phase 6.6 pattern, add:

```bash
firebase functions:shell --project schoolconnect-nlg
```

Then in the shell:
```js
// Simulate a prof approval — replace uid with a real en_attente doc
onProfActivated({
  uid: 'some-uid',
  before: { statut: 'en_attente', email: 'test@ex.com', nom: 'Test' },
  after: { statut: 'actif', email: 'test@ex.com', nom: 'Test' }
})
// Expect: loginPasskey stamped on /professeurs/some-uid, email sent
```

For real tests: create a sandbox project, signup a fake prof, admin-
approve them, verify email arrived with a 6-digit code, verify the
gate unlocks with that code.

---

## Where to resume

**Next session's first action**: say "build E1b" to continue.
Reference this file. My intended E1b output:
- 4 new triggers in `functions/src/triggers/`
- 1 new scheduled function
- 2 new callables (findEleveIdentity, regenerateOwnPasskey)
- Updated index.ts
- Updated DEPLOY-ONCE-BLAZE-IS-READY.md Session E section

**After E1b**: E2 (client wiring with fallbacks), then E3 (rules +
migration button).

Last updated: 23 April 2026 — Session E1a complete.
