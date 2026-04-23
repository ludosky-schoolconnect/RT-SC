# Session E — Prof Security + Orphan Cleanup (HANDOVER)

**Purpose**: server-side foundation for per-prof login passkeys, plus
Firestore trigger-based orphan cleanup for deletions the client misses.

**Deployment state**: E1a + E1b + E2 shipped. E3 pending.
All pending work is Blaze-deployable; nothing activates until Blaze is on.

---

## What shipped in E1a

### Blaze-dormant (6 files in `functions/src/`)

| File | Role |
|---|---|
| `lib/passkey.ts` | Helpers: 6-digit generator, HMAC sign/verify, rate limiter |
| `http/verifyProfLogin.ts` | HTTPS callable: email+passkey → HMAC token |
| `triggers/onProfActivated.ts` | Generates loginPasskey + emails on en_attente→actif |
| `triggers/onProfDeleteCascade.ts` | Cleans matieresProfesseurs, notes.professeurId, colles.donneParProfId |
| `triggers/onClasseDelete.ts` | Cleans presences, publications, emploisDuTemps, coefficients_{cid} |

### Client changes (immediate, non-Blaze)

- `src/types/models.ts` — dropped rotation fields; added loginPasskey, loginPasskeyVersion, lastLoginAt on Professeur
- `src/hooks/useProfsMutations.ts` — removed rotation timestamp writes (hotfix re-added useUpdateOwnProfSignature)
- `src/routes/admin/tabs/profs/PasskeyProfPanel.tsx` — removed rotation UI theater

---

## What shipped in E1b

### Blaze-dormant (5 files in `functions/src/`)

| File | Role |
|---|---|
| `triggers/onEleveDeleteCascade.ts` | Safety-net éleve subcollection cleanup + annuaire + quete claims |
| `triggers/onPreInscriptionDelete.ts` | Deletes documents/* subcollection |
| `scheduled/expireStalePasskeys.ts` | Weekly Sunday 03:00 — clears loginPasskey on profs inactive 90+ days |
| `http/findEleveIdentity.ts` | HTTPS callable for éleve signup + parent login identity lookup |
| `http/regenerateOwnPasskey.ts` | HTTPS callable for prof self-rotation |

---

## What shipped in E2 (THIS session)

All client-side. Each surface tries the Blaze callable first; on
`functions/not-found` / `functions/unavailable`, falls back to the
pre-Blaze behavior. Post-Blaze, callables succeed first and fallback
is silently skipped (dead branch).

### Client files modified (5)

| File | Change |
|---|---|
| `src/firebase.ts` | Added `getFunctions` import + `functions = getFunctions(app, 'us-central1')` export |
| `src/routes/auth/ProfPasskeyGate.tsx` | Email field added alongside passkey; calls `verifyProfLogin`; richer sessionStorage shape with token + expiresAt + mode; backwards-compat with Session 4b bare "1" marker; 12h TTL |
| `src/routes/auth/EleveSignup.tsx` | Calls `findEleveIdentity` with `mode: 'byIdentity'`; legacy collectionGroup fallback preserved verbatim |
| `src/routes/auth/ParentLogin.tsx` | Calls `findEleveIdentity` with `mode: 'byParentPasskey'`; legacy collectionGroup fallback; follow-up direct doc read on the éleve for nom/genre |
| `src/routes/prof/tabs/profil/MonProfilSection.tsx` | Added "Code de connexion" card with "Régénérer mon code" button + confirmation modal + post-regenerate display with copy button |

### Fallback error-code handling

Each surface catches these callable error codes as "Blaze not deployed yet":
- `functions/not-found`
- `functions/unavailable`
- `functions/internal` (sometimes surfaces when function cold-starts on missing secret; conservative fallback)

For real errors (unauthenticated, resource-exhausted, permission-denied), surfaces show appropriate user-facing messages, NOT the fallback.

### Notable design decisions

1. **ProfPasskeyGate email field is optional during transition**. If empty, the gate skips the callable and goes straight to legacy school-wide passkey compare. Rationale: profs who haven't migrated to per-prof passkeys yet can still use the existing flow without confusion.

2. **findEleveIdentity returns only `{eleveId, classeId}`** — the full éleve doc read still happens client-side via `getDoc` on the specific path. This works today because `/{path=**}/eleves/{eleveId}` has `allow read: if true`. **This will break when E3 tightens that rule** — see E3 section below for the architectural fix.

3. **regenerateOwnPasskey callable returns the passkey in the response**, not just via email. This is intentional: profs see the code immediately in the UI modal and email is redundancy for when they close the tab. The callable body was written this way in E1b.

---

## What is NOT yet built

### E3 — rules tightening + admin migration button + architectural decision

1. **Architectural decision for `findEleveIdentity`**: Before tightening the eleves collectionGroup read rule, decide whether to expand the callable's return payload to include `nom`, `genre`, `passkeyParent` (class passkey via joined lookup server-side) so the client never needs to read the éleve doc directly post-auth. Alternative: keep callable returning just IDs and rely on the anonymous-sign-in happening BEFORE the follow-up read, with a rule like `allow read: if request.auth != null`. The second option is simpler but weaker (any anonymous user can scan once they've anon-signed-in — which defeats the goal of closing the collectionGroup hole). **Recommended: expand callable return.**

2. **`firestore.rules` changes**:
   - `/{path=**}/eleves/{eleveId}` → `allow read: if request.auth != null && isStaff()` (assuming we took the callable-expansion path above; if not, loosen to `if request.auth != null`)
   - `/professeurs/{uid}` update rule — block client-direct writes to `loginPasskey`, `loginPasskeyVersion`, `lastLoginAt` fields:
     ```
     allow update: if ...existing conditions...
                   && !request.resource.data.diff(resource.data).affectedKeys()
                      .hasAny(['loginPasskey', 'loginPasskeyVersion', 'lastLoginAt']);
     ```
     (Server-side admin SDK writes bypass rules, so the triggers/callables work unaffected.)

3. **Admin migration UI — "Générer les codes manquants"**:
   - Button in AdminDashboard → Profs tab, near PasskeyProfPanel
   - Calls a new admin-only callable `regeneratePasskeyForProf({ profId })` that runs the onProfActivated generation logic
   - Iterates all active profs with missing/empty `loginPasskey`
   - Shows progress + per-prof result
   - Needed for backfilling profs who were already `actif` before onProfActivated deployed

4. **Update `DEPLOY-ONCE-BLAZE-IS-READY.md`** — confirm the full Session E deploy checklist is in sync.

---

## Session E2 migration notes

- **Session 4b marker compatibility**: existing tabs with `sessionStorage[GATE_KEY] === '1'` (the bare "1" from before E2) are still recognized as legacy-mode unlocks by `readGate()`. They'll upgrade to the richer JSON shape on next successful gate entry.
- **No migration needed for existing sessions**: profs already authenticated bypass the gate entirely (`alreadyAuthed` check unchanged).
- **Dev-mode smoke test pre-Blaze**: every callable path intentionally fails fast with `functions/not-found` locally (since no functions are deployed) and falls back to legacy. Gate still unlocks, éleve signup still works, parent login still works. MonProfilSection shows a toast explaining the regenerate feature isn't available yet.

---

## Critical conventions (match when writing E3)

- File-top JSDoc: purpose, invariants, idempotency, what NOT done
- Imports: firebase-admin/*, firebase-functions/v2/*, node:crypto
- Error handling: structured log context, rethrow only when retry helps
- Idempotency guards: "already done?" checks everywhere
- Session labels in comments: `// Session E1a`, `// Session E1b`, `// Session E2`, etc.
- HMAC_SECRET: any function using it declares `secrets: [HMAC_SECRET]`

---

## Key architectural decisions (recap)

1. Separate trigger for onProfDeleteCascade vs onProfDelete — single responsibility
2. Plaintext passkey storage — 6 digits, rate-limited, rules-restricted
3. HMAC payload.v (passkeyVersion) — rotation invalidates all tokens without blacklist
4. Client-side fallbacks — preserve pre-Blaze behavior; become dead code post-activation
5. onProfActivated not onProfCreate — admin approval is the natural credential-issuance moment
6. findEleveIdentity returns only `{eleveId, classeId}` — see E3 note for the architectural revisit

---

## Risk & rollback

- **E2 client changes** are all additive (new email field optional; new regenerate card doesn't touch signature flow; callable paths are try/catch with fallback). Rollback via `git revert` of the E2 commit is safe and returns to pre-E2 behavior entirely.

- **Blaze deploy of E1a+E1b functions**: nothing fires pre-deploy. Post-deploy, the E2 client wires connect automatically. No coordination needed between client deploy and functions deploy — they can happen in any order.

- **Emergency rollback** (if any E-session trigger misbehaves after Blaze):
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
  Clients fall back to legacy paths automatically.

---

## Secrets & env vars needed

Before deploying Session E functions:

```bash
openssl rand -base64 48 > /tmp/hmac-secret.txt

for sid in schoolconnect-nlg schoolconnect-mag schoolconnect-houeto schoolconnect-1adfa; do
  firebase functions:secrets:set HMAC_SECRET --project "$sid" --data-file /tmp/hmac-secret.txt
done

rm /tmp/hmac-secret.txt
```

`RESEND_API_KEY` is reused by onProfActivated, expireStalePasskeys, regenerateOwnPasskey.

---

## Where to resume

**Next session's first action**: say "build E3" to continue.
Reference this file.

E3 output will be:
- Decision on findEleveIdentity return shape (probably expand to include nom/genre/class passkey)
- Firestore rules edits (tighten eleves collectionGroup + restrict loginPasskey field writes)
- New callable `regeneratePasskeyForProf` (admin-only)
- New admin UI button in Profs tab
- DEPLOY-ONCE-BLAZE-IS-READY.md final sync

Last updated: 23 April 2026 — Session E2 complete.
