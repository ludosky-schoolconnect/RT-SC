# Phase 6g Turn 1 — Security Hardening (Firestore Rules)

## What this phase addresses

Before Phase 6g, the app had a CRITICAL security hole: any admin
could extend their own subscription to 2099 via 3 lines of F12
JavaScript. Firestore rules allowed admins to write any field on
`ecole/subscription`, including `deadline`.

The SaaS business model was trivially bypassable.

## What this turn ships

### 1. Locked-down subscription rules (`firestore-6g.rules`)

New rules for `ecole/subscription`:

- **SaaSMaster (you)**: full read + write + delete
- **Admin**: can ONLY flip `hasRequestedUnlock` to `true`. Cannot
  write `deadline`, `isManualLock`, `fedaPayPublicKey`, `subscriptionPrice`,
  `subscriptionDurationMonths`, `supportWhatsAppNumber`.
- **Anyone else**: read only

Rule order matters. The specific `/ecole/subscription` match comes
BEFORE the catch-all `/ecole/{document=**}` so Firestore picks the
tighter rule first.

### 2. `isSaaSMaster()` now checks UID, not email

Email can be recovered via password reset or email verification
bypass. UIDs are cryptographically bound to the account creation. This
flip reduces the blast radius if your Gmail credentials ever leak.

### 3. `annuaire_parents` write requires staff (not any authenticated)

Previously any authenticated user — including anonymous-authed élèves —
could write to the parent directory. Now it's staff-only (admin or
prof, NOT caissier or élève).

### 4. LockedPage onComplete — no more client-side deadline write

Since admins can't write `deadline` anymore, the FedaPay payment flow
changes:

**Before (trivially bypassable):**
1. Admin pays via FedaPay
2. Client code writes new deadline directly to Firestore
3. Admin is unlocked
4. ANY admin can trigger step 2 without step 1 via F12 → infinite
   subscription without paying

**Now (until Cloud Function webhook ships):**
1. Admin pays via FedaPay
2. Client code writes `hasRequestedUnlock: true`
3. A `🔔` alert appears in your vendor command center
4. You verify the transaction on the FedaPay dashboard
5. You click "Paiement reçu — ajouter la durée" in vendor app
6. Deadline extends, admin is unlocked

This is less magical but it's genuinely secure. The only trusted
extension path is via SaaSMaster credentials (you).

**Phase 6g Turn 2 (future)**: FedaPay webhook → Cloud Function. FedaPay
signs a server-to-server notification that a payment completed. The
function validates the signature and extends the deadline
automatically, with admin-SDK privileges (bypassing Firestore rules).
This restores the magical auto-unlock UX AND keeps the security.

## What still isn't fixed (known, deferred to later turns)

### Medium priority
- **`rv_counters/` is world-writable**. Anyone can scribble in the
  rendezvous counter docs. Low-stakes data but it's a spam vector.
  Fix: restrict writes to increment-only.
- **Eleve session handshake via client-side PIN check**. Anyone who
  knows a `classeId` + `eleveId` can claim an eleve session via F12
  (skip the PIN check, sign in anonymously, write `active_session_uid`).
  Fix: move PIN verification to a Cloud Function that mints custom
  tokens.

### Low priority
- **`professeurs/{id}` is readable by any authenticated user** including
  anonymous-authed élèves. The data isn't highly sensitive (nom,
  prénom, role, classesIds, matières — NOT passwords), but could be
  tightened to staff-only reads.

All of the above are tracked as TODOs in the rules file and will be
addressed in Turn 2 along with the FedaPay webhook.

## Vendor app compatibility

The vendor app at `/vendor-app/` uses `isSaaSMaster()` implicitly — when
you log in there, you're authenticated as yourself (UID match), so
you get full write access to every school's `ecole/subscription`. No
change needed to the vendor app.

## Deployment

For each school's Firebase project:

1. Copy `firestore-6g.rules` to that school's folder as `firestore.rules`
2. Verify the SaaSMaster UID on line 53 matches your UID in THAT
   school's Firebase Auth. If you used the same Gmail everywhere,
   Firebase assigns different UIDs per project — you'll need to log
   in once to each project to get the UID, OR use a Custom Claim
   approach (more robust, deferred to a polish pass).
3. Deploy:
   ```bash
   firebase deploy --only firestore:rules
   ```

### ⚠️ UID-per-project caveat

The hardcoded UID `ARCosTxTeZYvk9cj548mnRzaYKG2` in the rules file is
a specific Firebase Auth UID, which is per-Firebase-project. When you
clone RT-SC to a new school:

1. Make sure your admin account exists in that school's Firebase Auth
   (log in once via the RT-SC admin signup)
2. Copy your UID from Firebase Console → Authentication → Users
3. Update the rules file for that school with YOUR UID
4. Deploy

This is tedious but secure. Phase 6g Turn 3 may introduce a "vendor
master" custom claim that's set by a Cloud Function, which would make
all your UIDs recognizable without hardcoding each one.

## Testing the new security model

After deploying the rules:

### Test 1: Admin cannot bypass via F12
1. Log in as admin to RT-SC
2. Open DevTools console
3. Run:
   ```js
   import('firebase/firestore').then(m => {
     const ref = m.doc(window.firebase?.db ?? db, 'ecole/subscription')
     return m.setDoc(ref, {
       deadline: m.Timestamp.fromDate(new Date('2099-01-01'))
     }, { merge: true })
   }).then(() => alert('HACKED')).catch(e => alert('Blocked: ' + e.code))
   ```
4. Expected: `Blocked: permission-denied`. Rules reject the write.

### Test 2: Admin CAN flip hasRequestedUnlock
1. As admin, click "Signaler un paiement externe" on /locked
2. Check Firestore — `hasRequestedUnlock: true` appears on
   `ecole/subscription`
3. In your vendor app, the school's 🔔 alert appears

### Test 3: Ludosky can still write anything via vendor app
1. Log into vendor app with your credentials
2. Pick the school, change any config, save
3. Write succeeds

### Test 4: FedaPay payment flow
1. As admin, tap "Payer via FedaPay"
2. Pay with sandbox credentials
3. On success, admin sees "Paiement reçu — en cours de vérification"
4. In Firestore, `hasRequestedUnlock: true` is set
5. Vendor app shows the alert
6. You manually click "Paiement reçu — ajouter la durée"
7. Admin's deadline extends, they're unlocked

## Files changed

**New:**
- `firestore-6g.rules` — hardened rules (replaces `firestore-6d.rules`
  when you deploy)
- `PHASE-6g-TURN-1-SECURITY-NOTES.md` — this file

**Modified:**
- `src/routes/locked/LockedPage.tsx` — removed client-side deadline
  write, now flips `hasRequestedUnlock` only on FedaPay success,
  updated copy to set expectations about verification

## Roadmap

- ✅ Phase 6g Turn 1: rules hardening + LockedPage security fix (this ship)
- NEXT: Phase 6g Turn 2: FedaPay webhook via Cloud Function (restores
  auto-unlock after payment), PIN verification via Cloud Function,
  `rv_counters` tightening
- THEN: Phase 6g Turn 3: polish (custom claims for vendor recognition,
  prof directory read tightening)
- AFTER: production deployment playbook
