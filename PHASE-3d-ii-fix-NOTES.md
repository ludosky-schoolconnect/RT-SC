# RT-SC · Phase 3d-ii.1 — À propos error fix + Firestore rules

Quick patch to fix the "Impossible de charger cette page" error you saw on `/a-propos`. The fix has two parts:

1. **`firestore.rules`** — adds a public-read rule for `cms/about` so visitors can read your published content
2. **`AboutPage.tsx`** — gracefully degrades to "Page bientôt disponible" on permission-denied instead of showing the misleading connection error

## Why the error happened

Your Firestore Security Rules deny reads by default for any collection you haven't explicitly allowed. The `cms` collection wasn't in your rules, so the catch-all denied anonymous visitors → `getDoc` threw → the page hit the error branch.

## Apply on Termux

```bash
cd ~/RT-SC && unzip -o ~/storage/downloads/RT-SC-phase3d-ii-fix.zip
```

Then **deploy the new rules to Firebase**. Two options:

### Option A: Firebase Console (easiest, no CLI needed)

1. Open Firebase Console → your project → **Firestore Database** → **Rules** tab
2. Open `~/RT-SC/firestore.rules` in a text viewer (Termux `cat firestore.rules`)
3. Copy the whole file content
4. Paste it into the Firebase Console rules editor (replacing what's there)
5. **Important**: find this line:
   ```
   allow write: if request.auth != null && request.auth.uid == "OWNER_UID";
   ```
   and replace `OWNER_UID` with your actual Firebase UID (same one you put in `VITE_OWNER_UID`).
6. Click **Publish**. Wait ~30 seconds for propagation.

### Option B: Firebase CLI (if you have it set up)

```bash
cd ~/RT-SC && firebase deploy --only firestore:rules
```

(You'll still need to swap `OWNER_UID` in the file before deploying.)

## What the new CMS rule does

```js
match /cms/{docId} {
  allow read: if true;                                    // public can read
  allow write: if request.auth != null
    && request.auth.uid == "OWNER_UID";                   // only you can write
}
```

- **Read** is open to everyone — needed so `/a-propos` works for anonymous visitors
- **Write** is restricted to your specific UID — even other admins can't edit
- This matches the `<UidGate>` client-side check so security is enforced both ways

## Test after deploying

1. Reload `/a-propos` on your phone — should now show **"Page bientôt disponible"** (no more red error message)
2. Sign in to the editor at `/__cms/about`, type some content, toggle Publié, save
3. Reload `/a-propos` — your content should appear
4. Open `/a-propos` in an incognito window (not signed in) — should still work, content visible

## What's NOT in this fix

- The rollover UI (Transition + Final Archive modals) — that's still **Phase 3d-iii**, ships next turn
- Any other rules tightening — Phase 10 covers the broader security audit

## Note

I've kept the rest of your legacy rules verbatim (unchanged from `SchoolConnectLive-main/firestore.rules`). Only the `cms` rule is new. So deploying these rules won't break any existing legacy app behavior.
