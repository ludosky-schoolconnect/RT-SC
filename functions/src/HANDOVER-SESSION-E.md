# Session E — Prof Security + Orphan Cleanup (HANDOVER)

**Purpose**: server-side foundation for per-prof login passkeys, plus
Firestore trigger-based orphan cleanup for deletions the client misses.

**Deployment state**: E1a + E1b + E2 + E2 hotfix + E3 complete.
Session E is fully shipped. Functions are dormant until Blaze deploy.

---

## Session E contents (full list)

### E1a — foundation
- `functions/src/lib/passkey.ts` — 6-digit gen, HMAC sign/verify, rate limiter
- `functions/src/http/verifyProfLogin.ts` — email+passkey → HMAC token callable
- `functions/src/triggers/onProfActivated.ts` — auto-generate passkey on approval
- `functions/src/triggers/onProfDeleteCascade.ts` — clean matieresProfesseurs, notes/colles author refs
- `functions/src/triggers/onClasseDelete.ts` — clean presences, publications, emploisDuTemps, coefficients
- Client: SecuriteConfig type changes, useProfsMutations cleanup, PasskeyProfPanel UI simplification

### E1b — orphan + scheduled + self-service
- `functions/src/triggers/onEleveDeleteCascade.ts` — safety net + annuaire + claims
- `functions/src/triggers/onPreInscriptionDelete.ts` — docs subcol cleanup
- `functions/src/scheduled/expireStalePasskeys.ts` — weekly 90-day inactivity expiry
- `functions/src/http/findEleveIdentity.ts` — identity lookup callable (E3 later expanded payload)
- `functions/src/http/regenerateOwnPasskey.ts` — prof self-rotation callable

### E2 — client wiring with pre-Blaze fallbacks
- `src/firebase.ts` — export `functions` at us-central1
- `src/routes/auth/ProfPasskeyGate.tsx` — email+passkey gate, callable-first with legacy fallback
- `src/routes/auth/EleveSignup.tsx` — findEleveIdentity callable with legacy fallback
- `src/routes/auth/ParentLogin.tsx` — findEleveIdentity callable with legacy fallback
- `src/routes/prof/tabs/profil/MonProfilSection.tsx` — "Régénérer mon code" card

### E2 hotfix — security + TS
- ProfPasskeyGate no longer auto-bypasses authenticated users (fresh tab always prompts; deliberate for "lost device" threat model)
- Removed dead bare-string error-code comparisons across all 4 client surfaces (TS2367 cleanup)

### E3 — rules tightening + admin migration + TTL tune
- `functions/src/http/findEleveIdentity.ts` — **expanded return payload** to include `nom`, `genre`, `classePasskey`, `classeNom` so clients no longer need follow-up éleve doc reads (enables tightening the eleves collectionGroup rule without breaking signup/parent login)
- `functions/src/http/regeneratePasskeyForProf.ts` — admin-only callable with role check, used by the migration button
- `functions/src/index.ts` — Session E3 export
- `firestore.rules` — eleves collectionGroup read tightened to `isStaff()`; professeurs update rule blocks client writes to `loginPasskey`, `loginPasskeyVersion`, `lastLoginAt` fields (server admin SDK bypasses, as expected)
- `src/hooks/useProfsMutations.ts` — `useRegeneratePasskeyForProf` hook wrapping the callable
- `src/routes/admin/tabs/profs/MigrateProfPasskeysButton.tsx` — new admin UI card with "Générer les codes manquants" button, iterates candidates, shows per-prof progress
- `src/routes/auth/ProfPasskeyGate.tsx` — **TTL change 12h → 4h** to catch "walked away from device" within school-day scenarios (covers PWA background-persistence gap)
- `src/routes/auth/EleveSignup.tsx` — consume expanded findEleveIdentity payload directly (no follow-up doc read); legacy fallback preserved
- `src/routes/auth/ParentLogin.tsx` — same pattern

---

## Where to mount MigrateProfPasskeysButton

The component is in `src/routes/admin/tabs/profs/` next to `PasskeyProfPanel.tsx`. Wherever the admin Profs tab renders (likely `ProfsTab.tsx`), import and render it alongside or above `<PasskeyProfPanel />`. It auto-hides when there's nothing to migrate, so leaving it mounted permanently is safe.

Example integration (review wherever the admin Profs tab is composed):
```tsx
import { MigrateProfPasskeysButton } from './MigrateProfPasskeysButton'
// ...
<MigrateProfPasskeysButton />
<PasskeyProfPanel />
```

---

## Rules coordination on deploy day

The tightened `firestore.rules` **depends on Blaze being active** for client flows to work:

- Éleve signup + parent login now route through `findEleveIdentity` (post-Blaze) OR the legacy collectionGroup query (pre-Blaze, which only works while the rule is `allow read: if true`).
- **If you deploy the E3 rules without Blaze being on, signup and parent login break** — the fallback path hits the tightened collectionGroup read and fails.

**Deploy day sequence**:
1. Set `HMAC_SECRET` per school
2. `firebase deploy --only functions` (Session E goes live)
3. **Then** deploy the E3 rules: `./deploy-school.sh --rules-only schools/<id>.json`
4. Functions must be live BEFORE rules. Reverse order breaks signup.

**If you redeploy the RT-SC client without deploying the rules**, that's fine — the client tries the callable first anyway, and the fallback still has a valid (pre-E3) rule to read against.

---

## Rollback for E3 specifically

If E3 rules cause issues post-deploy:

```bash
# Revert the tightened rules (keep E3 client + functions untouched)
git revert <E3-commit-sha>
./deploy-school.sh --rules-only schools/<id>.json
```

This restores `allow read: if true` on the eleves collectionGroup and unblocks signup even if something went wrong on the functions side.

To fully roll back E3:
```bash
firebase functions:delete regeneratePasskeyForProf --project <sid> --force
```

Rolling back E1a/E1b/E2 listed in earlier handover versions — same pattern.

---

## Secrets & env vars

Before deploying Session E functions:

```bash
openssl rand -base64 48 > /tmp/hmac-secret.txt

for sid in schoolconnect-nlg schoolconnect-mag schoolconnect-houeto schoolconnect-1adfa; do
  firebase functions:secrets:set HMAC_SECRET --project "$sid" --data-file /tmp/hmac-secret.txt
done

rm /tmp/hmac-secret.txt
```

`RESEND_API_KEY` is reused by onProfActivated, expireStalePasskeys, regenerateOwnPasskey, regeneratePasskeyForProf.

---

## Testing checklist (post-Blaze deploy)

1. **Signup (éleve)**: fresh identity → callable returns expanded payload → success screen shows class + passkey, no direct éleve doc read performed.
2. **Parent login**: passkey lookup → callable returns all fields → session created, anon signin happens, éleve marker updated.
3. **Prof signup**: new prof submits via ProfAuth → en_attente → admin flips to actif → onProfActivated fires → prof receives email with loginPasskey → prof can unlock gate with email + that passkey.
4. **Prof self-rotation**: Mon profil → Régénérer mon code → new code shown immediately + emailed.
5. **Admin migration**: admin clicks "Générer les codes manquants" → progress shows per-prof → emails go out → candidates list empties.
6. **Gate TTL**: unlock gate → leave tab open for 5 hours → next interaction re-prompts.
7. **Gate PWA**: install PWA → unlock → swipe away → relaunch → re-prompts.
8. **Rules**: F12 an admin session, try `setDoc('professeurs/<uid>', { loginPasskey: '000000' })` → should fail with permission-denied.
9. **Orphan cleanup**: delete a class with presences/seances → verify /classes/{cid}/presences and /emploisDuTemps/{cid}/seances are gone.

---

## What comes after Session E

Session E is complete. Next likely work areas (not scoped or committed to):

- **Session F (hypothetical) — gate hardening**: re-prompt on `visibilitychange` when PWA comes back from background > N minutes. Would close the "PWA stayed in memory through the whole afternoon" gap.
- **Legacy path removal**: once Blaze is proven stable in production for a month or two, remove the pre-Blaze fallbacks from the 4 client surfaces. Saves client bundle size, removes dead code.
- **Session D (originally planned) — Frontend cleanup**: remove client-side workarounds now redundant with Cloud Functions (e.g. the client's presence rollover that dailyPresenceRollover supersedes).

Last updated: 23 April 2026 — Session E3 complete.
