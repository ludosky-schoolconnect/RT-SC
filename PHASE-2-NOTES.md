# RT-SC · Phase 2 — Authentication

This phase replaces the placeholder auth screens with real, working ones.

## What's new

| Route | Status |
|---|---|
| `/` | Real — school code gate, persists code to localStorage, redirects |
| `/welcome` | Real — role selection (3 cards + parent + inscription links) |
| `/auth/admin` | Real — email + password with role validation |
| `/auth/prof` | Real — login + signup tabs, passkey gate before account creation |
| `/auth/eleve` | Real — first-time vs returning fork |
| `/auth/eleve/signup` | Real — identity verification (collectionGroup query) returns class passkey |
| `/auth/eleve/login` | Real — 3-step flow (passkey → name list → PIN modal) |
| `/parent` | Real — login + dashboard placeholder |
| `/prof/en-attente` | Real — auto-transitions when admin approves |

The admin / prof / élève dashboards themselves are still Phase 0 placeholders. Phase 3 onward fills those in.

## Required Firestore index — IMPORTANT

The élève signup screen uses a `collectionGroup` query on `(nom, genre, date_naissance)`. The parent login uses one on `passkeyParent`. **These need composite indexes to work.**

Two ways to deploy them:

### Option A — Firebase CLI (one-time setup)

If you have the Firebase CLI installed and logged in on a desktop:

```bash
cd /path/to/RT-SC
firebase deploy --only firestore:indexes
```

The `firestore.indexes.json` file is included in this phase.

### Option B — Click the link Firebase shows you

The first time you try to log in as a parent or verify identity as an élève, Firebase will show an error like:

> The query requires an index. You can create it here: https://console.firebase.google.com/...

Click that link, hit "Create index", wait 1-2 minutes for it to build, retry. Do this for both queries (parent passkey + élève identity). After that, both screens work.

For now, the auth flows that DON'T need new indexes will work immediately:
- Admin login ✅
- Prof login ✅
- Prof signup ✅
- Élève login (with existing passkey) ✅

The two that need the indexes are:
- Élève signup (identity verification)
- Parent login

## What to test

After installing this phase:

1. **Open the app** at `http://localhost:5173/`. You should see the navy "Code de l'école" screen.
2. Enter your real school code (e.g. `SC-ALPHA-99`). It saves and forwards to `/welcome`.
3. **Welcome screen** — 3 role cards animated in, gold accents, parent + inscription buttons at the bottom.
4. **Admin login** — enter your existing admin credentials. Should redirect to the (still-placeholder) `/admin` page.
5. **Prof signup** — try with a wrong passkey first to confirm the gate blocks account creation. Then with the correct one.
6. **Prof en-attente** — log in as a non-approved prof. You should see the waiting screen. Have an admin (in Firebase console for now) flip `professeurs/{uid}.statut` to `'actif'` — the screen should auto-redirect.
7. **Élève login** — passkey, then tap a name, then enter the PIN. Modal should slide in nicely. PIN validation works against `eleves/{id}.codePin`.
8. **Parent login** — enter a real `passkeyParent`. After deploying the index, this works.

## Notes

- Local storage keys used: `sc_school_code`, `sc_eleve_session`. No legacy keys carried over.
- Anonymous Firebase sessions (élève + parent) are deliberately ignored by the AuthProvider, so they don't collide with the email/password observer.
- Logout is wired on the en-attente screen and parent dashboard. Logout from admin/prof/élève dashboards comes in their respective phases.
