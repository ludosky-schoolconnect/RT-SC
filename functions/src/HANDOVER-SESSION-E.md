# Session E — Prof Security + Orphan Cleanup (FINAL HANDOVER)

**Purpose**: server-side foundation for per-prof login passkeys, plus
Firestore trigger-based orphan cleanup for deletions the client misses.

**Status**: E1a + E1b + E2 + E2 hotfix + E3 + E4 complete.
Session E is fully shipped. Blaze activation required for the system
to function — see the deploy steps below.

---

## What changed in E4 vs the prior E3 commits

E4 is the "commit to Blaze" cleanup. It removes the pre-Blaze
fallback code paths that E1a/E1b/E2/E3 carried as transition scaffolding,
and hardens the email-delivery pipeline so passkeys never travel
through email.

### Client files changed (5)

| File | Change |
|---|---|
| `src/routes/auth/ProfPasskeyGate.tsx` | Removed `verifyLegacy()`, removed `mode: 'legacy'` from GateUnlock, removed SecuriteConfig import, email is now REQUIRED. Any stale pre-E4 sessionStorage entries (bare "1" marker or legacy-mode JSON) are treated as expired and the user re-enters email+passkey once. |
| `src/routes/auth/EleveSignup.tsx` | Removed the collectionGroup fallback. Callable is the only path. Dropped `collectionGroup`/`query`/`where`/`getDocs`/`getDoc`/`fsDoc`/`db` imports + `Classe`/`Eleve` imports (unused now) + `isFallbackCode` helper + `nomClasse`. |
| `src/routes/auth/ParentLogin.tsx` | Same treatment — server-only, no fallback. Kept `fsDoc` + `updateDoc` for the post-match `active_parent_session_uid` write (still needed). |
| `src/routes/prof/tabs/profil/MonProfilSection.tsx` | Removed `isFallbackCode` + "Blaze not available" toast message. Success toast no longer says "Consultez votre email" since the email no longer contains the code. |
| `src/routes/admin/tabs/profs/MigrateProfPasskeysButton.tsx` | Removed the `blazeMissing` early-break path. If the callable fails, the failure is reported per-prof in the progress table. |

### Functions files changed (3)

| File | Change |
|---|---|
| `functions/src/triggers/onProfActivated.ts` | Email body no longer includes the passkey. Email is now a notification: "your account is activated, ask your administrator for your code." Subject unchanged. Tag updated to `prof-activated-notification`. |
| `functions/src/http/regeneratePasskeyForProf.ts` | Same treatment — admin-initiated regeneration still writes the new passkey server-side and returns it to the admin's UI, but the email to the prof is just a notification. Tag updated to `passkey-admin-regenerated-notification`. |
| `functions/src/http/regenerateOwnPasskey.ts` | Self-rotation email changed from "here's your new code" to "your code was regenerated from your account." The prof already sees the code in their browser via the callable response, so email duplication was removing not security. Also serves as security audit trail ("if you didn't do this, contact admin"). Tag updated to `passkey-self-rotated-notification`. |

### Not changed in E4

- `functions/src/scheduled/expireStalePasskeys.ts` — already doesn't leak the code (it notifies the prof their code was CLEARED due to inactivity). No change needed.
- `functions/src/http/verifyProfLogin.ts` — server-side verification unchanged.
- `functions/src/http/findEleveIdentity.ts` — unchanged.
- Firestore rules — unchanged from E3 (still requires staff read on eleves collection group, blocks client writes to the three session-managed fields on professeurs).
- `passkeyProf` field in SecuriteConfig — **kept**, still used as the signup gatekeeper in `ProfAuth.tsx`. Session E was only ever about login. The PasskeyProfPanel admin UI is unchanged.
- `passkeyCaisse` — same, still used for caissier signup.
- The 4h gate TTL — unchanged.

---

## What the complete auth architecture looks like post-E4

### Signup (unchanged from pre-E)

- **Prof signup** (`ProfAuth.tsx`): new prof types the school-wide `passkeyProf` + their credentials, creates account with `statut: 'en_attente'`. Admin must approve.
- **Caissier signup** (`CaisseAuth.tsx`): same flow with `passkeyCaisse` (falls back to `passkeyProf` if `passkeyCaisse` is unset).
- **PasskeyProfPanel** rotates these school-wide signup codes. Unchanged.

### Login (E4-hardened)

- **ProfPasskeyGate**: fresh tab opens → user types `email` + per-prof `loginPasskey`. Submitted to `verifyProfLogin` callable. On success, HMAC-signed 12h token returned, stashed in sessionStorage with 4h client-side TTL for re-prompt. Gate applies to every fresh tab regardless of Firebase Auth state.
- **After the gate**: user lands on the regular Firebase Auth email+password login form.
- **Éleve signup**: single-step lookup via `findEleveIdentity` callable. Only path.
- **Parent login**: same callable, `byParentPasskey` mode. Anonymous sign-in happens after the match.

### Credential distribution

- **Passkey generation**: always server-side (`onProfActivated` trigger, `regenerateOwnPasskey` callable, `regeneratePasskeyForProf` callable, or cleared by `expireStalePasskeys`).
- **Communication to the prof**: admin-initiated regenerations show the code in the admin's UI. Self-regenerations show the code in the prof's own browser. **Email never contains the passkey** — in all three flows, the email is a notification telling the prof to look elsewhere for the actual code (admin's screen or their own).

---

## Server-side security audit (what F12 can and cannot bypass)

Reviewed during E4 session:

### F12 cannot bypass ✓

- Gate verification — HMAC signed server-side with secret the client never has
- Passkey generation — server only (triggers + callables, admin SDK)
- Writing to `loginPasskey`/`loginPasskeyVersion`/`lastLoginAt` — blocked by rules (E3)
- Scanning the eleves collection group — blocked by rules (staff-only)
- Orphan cleanup — trigger-based, not clientside
- Email bodies — no passkey ever sent to email, so no exposure even if inbox is compromised

### F12 can still do ✗

- Pass through the gate if they know a prof's legitimate email + passkey combo (by design)
- Extend HMAC token's 4h TTL by manually editing sessionStorage — BUT the server issues tokens with 12h expiry anyway, and any sensitive server-side callable that checks the token rejects expired ones. Client TTL is UX, not security.
- Replay a stolen HMAC token within its validity window (physical-access threat; rare, bounded by token TTL and passkey rotation)

### Noted for future cleanup (not in Session E scope)

- Subscription unlock fields (`isManualLock`, `hasRequestedUnlock`) — client-side writes exist somewhere; rogue admins with F12 could extend own subscription. Separate session would be needed.
- Periodic rule audit recommended — if any rule regresses to `allow read/write: if true`, defenses slip quietly.

---

## Deploy sequence on Blaze activation day

Per school, in this exact order:

```bash
# 1. Set HMAC secret (same random value shared across all schools, once)
openssl rand -base64 48 > /tmp/hmac-secret.txt
firebase functions:secrets:set HMAC_SECRET --project <SID> --data-file /tmp/hmac-secret.txt

# 2. Deploy functions
firebase deploy --only functions --project <SID>

# 3. Deploy the tightened rules
./deploy-school.sh --rules-only schools/<SID>.json

# After all schools done
rm /tmp/hmac-secret.txt
```

**Order matters**: deploy functions BEFORE rules. The tightened rules
require `findEleveIdentity` to be live, otherwise éleve signup + parent
login break during the gap. Deploying the client is independent and
can happen any time before, during, or after.

---

## Testing checklist (post-Blaze deploy)

1. **Prof signup** (pre-activation): new prof submits with correct `passkeyProf` → created as `en_attente`. Unchanged flow.
2. **Admin approves prof**: statut flips to actif → `onProfActivated` fires → prof doc gets `loginPasskey` stamped → activation email arrives WITHOUT the code in it, with "ask your administrator" language. Admin sees the code in their own Profs tab UI via the migration button or future per-prof detail.
3. **Prof login flow**: new prof arrives at prof login → gate prompts for email + personal code → admin hands over code verbally → prof types both → gate unlocks → regular Firebase Auth email+password below.
4. **Prof self-rotation**: prof in Mon profil → Régénérer mon code → modal shows new code immediately on screen. Notification email (no code) arrives. Toast says "nouveau code généré" (no mention of email).
5. **Admin migration for pending-migration profs**: admin clicks "Générer les codes manquants" → per-prof progress → all success → candidates list empties. Each prof gets their notification email; admin reads each code from the per-prof result rows and communicates them.
6. **Éleve signup**: student types correct identity → server returns class name + passkey → displayed. Wrong identity → "identité introuvable." No client-side scan attempted.
7. **Parent login**: valid passkey → server returns full child info → anon signin → session populated.
8. **Rate limiting**: hammer `findEleveIdentity` 11+ times in 15min → "Trop de tentatives."
9. **Stale passkey expiry**: (wait 90+ days or manually mutate `lastLoginAt`) → scheduled job clears passkey, notifies prof.
10. **F12 defense**: logged-in admin, in devtools console, try `setDoc(doc(db, 'professeurs/<otherUid>'), {loginPasskey: '000000'}, {merge: true})` → fails with permission-denied (E3 rule blocks that field).
11. **Gate re-prompt**: unlock gate → close tab → reopen → gate prompts again. Same prof, same device. Tab stays open 5h → gate re-prompts on next interaction.

---

## Rollback procedures (if something goes wrong post-deploy)

### All server functions
```bash
firebase functions:delete verifyProfLogin findEleveIdentity regenerateOwnPasskey regeneratePasskeyForProf onProfActivated onProfDeleteCascade onClasseDelete onEleveDeleteCascade onPreInscriptionDelete expireStalePasskeys --project <SID> --force
```
Clients will now fail at the gate with no way through. Revert client to pre-E4 commits if needed.

### Rules only
```bash
git revert <E3-rules-commit-sha>
./deploy-school.sh --rules-only schools/<SID>.json
```
Restores `allow read: if true` on eleves collection group. Signup/parent login work via direct scan again. Server functions still work but the tightened rule relaxation is undone.

### Client only
Revert to the commit before E4 (E3 final state). Fallbacks return. But the tightened rules will reject the fallback collectionGroup scan, so unless rules are also rolled back, the signup/parent paths stay broken on the client. Full rollback = client + rules together.

---

## Where Session E ends

After E4, Session E is considered **done**. Any future work on the auth/security front is a new session:

- **Session F (hypothetical)**: visibilitychange re-prompt in gate, for stronger PWA background scenarios
- **Session G (hypothetical)**: subscription lock tightening (the `isManualLock` client-writable concern from audit)
- **Session H (hypothetical)**: rule audit tooling — catch regressions via CI if rules regress to overly-permissive

None of these are committed-to. They're notes for future planning.

Last updated: 23 April 2026 — Session E4 complete (ship phase, Blaze activation pending).
