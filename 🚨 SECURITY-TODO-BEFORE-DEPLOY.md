# 🚨 SECURITY-TODO-BEFORE-DEPLOY

**READ THIS FILE BEFORE RUNNING `firebase deploy` TO ANY PRODUCTION SCHOOL.**

This file exists because on 21 April 2026 Ludosky didn't have a
Blaze-eligible card, which meant we couldn't deploy Cloud Functions
for the FedaPay webhook. To keep localhost testing fast (auto-unlock
on FedaPay payment), we **temporarily reverted** the Phase 6g Turn 1
security fixes that protect the SaaS billing model.

**These reverts MUST be undone before any real school goes live.** If
you deploy the code as-is, any admin with basic DevTools knowledge
can extend their subscription to 2099 for free via 3 lines of
JavaScript in the browser console. The SaaS business model is
trivially bypassable.

---

## What's currently insecure

### Insecurity 1 — LockedPage writes `deadline` from the client

**File**: `src/routes/locked/LockedPage.tsx`

**Symptom**: The FedaPay `onComplete` handler calls
`payMut.mutateAsync({})`, which writes the new deadline directly to
Firestore from the browser. An attacker can invoke this mutation via
React DevTools without actually paying FedaPay.

**Location**: look for the big 🚨 comment block near the top of the
file (around line 73).

### Insecurity 2 — Firestore rule allows admin deadline writes

**File**: `firestore-6g.rules`

**Symptom**: The `match /ecole/subscription` rule allows
`isAdmin() || isSaaSMaster()` to write any field. Closing of the F12
hole from Turn 1 is undone.

**Location**: look for the big 🚨 comment block (around line 71).

---

## The revert procedure (do ALL of these before deploying)

### Step 1 — Obtain a debit card and upgrade Firebase to Blaze

The webhook Cloud Function can't be deployed without Blaze. Options:

- Chipper Cash USD virtual card (pan-African, accepts Beninese users)
- Djamo virtual Visa (Ivory Coast fintech, may accept Benin)
- Wave (Senegal/Ivory Coast)
- Family/friend with any Visa/Mastercard
- Kkiapay virtual cards

Once you have a card:

1. Firebase Console → Upgrade project → Blaze (Pay as you go)
2. Add the card as payment method
3. Set a budget alert at $10/month so you get warned before hitting
   the (very generous) free tier limits

Firebase's free tier for Cloud Functions is 2M invocations/month.
For a few schools you will NEVER hit that — expected monthly charge
is **$0.00**.

### Step 2 — Build and deploy the FedaPay webhook

Phase 6g Turn 2 — ask Claude to build this. High-level:

1. Create `functions/` folder with `firebase-admin`, `firebase-functions`, and the `fedapay` npm packages.
2. Create `functions/src/fedapayWebhook.ts` — an HTTPS function that:
   - Accepts POST with `x-fedapay-signature` header
   - Verifies signature using `Webhook.constructEvent()` from the `fedapay` package
   - Handles the `transaction.approved` event
   - Applies fairness logic and writes `deadline` with admin SDK
   - Sets `isManualLock: false`, `hasRequestedUnlock: false`
3. Deploy: `firebase deploy --only functions`
4. Grab the deployed URL (something like `https://us-central1-your-project.cloudfunctions.net/fedapayWebhook`)
5. Set it as the webhook URL in the FedaPay dashboard for each school's FedaPay account.
6. Store the per-school webhook secret as a Firebase function config or env var.

### Step 3 — Revert `src/routes/locked/LockedPage.tsx`

Change imports:

```typescript
// REMOVE this import:
import { usePayAndExtendSubscription, ... } from '@/hooks/useSubscription'

// KEEP:
import { useSubscription, useRequestUnlock } from '@/hooks/useSubscription'
```

In `export default function LockedPage()`:

```typescript
// REMOVE:
const payMut = usePayAndExtendSubscription()

// KEEP:
const unlockMut = useRequestUnlock()
```

Change `onComplete` handler:

```typescript
onComplete: async (resp) => {
  if (!isFedaPayApproved(resp)) {
    setPayStatus('idle')
    return
  }
  try {
    setPayStatus('processing')
    await unlockMut.mutateAsync()
    setPayStatus('success')
    toast.success(
      'Paiement reçu ! Déblocage en cours — votre accès sera rétabli sous quelques instants.'
    )
    // DON'T auto-navigate to /admin. The webhook will flip
    // hasRequestedUnlock:false + extend deadline. The subscription
    // guard will auto-redirect when it sees the new deadline.
  } catch (err) {
    console.error('[LockedPage] hasRequestedUnlock write failed:', err)
    setPayStatus('error')
    toast.error(
      'Paiement reçu côté FedaPay mais enregistrement impossible. Contactez le support avec votre reçu.'
    )
  }
},
```

Change button label switch:

```typescript
case 'success':
  return 'Paiement reçu — déblocage en cours…'
```

Change pay section copy:

```tsx
<p className="text-[0.8rem] text-ink-600 mb-4 leading-relaxed">
  Payez via FedaPay (Mobile Money){' '}
  {renewEarly
    ? 'pour renouveler votre abonnement'
    : 'pour réactiver votre accès'}
  . Votre abonnement sera prolongé de{' '}
  <span className="font-semibold text-navy">
    {sub.subscriptionDurationMonths} mois
  </span>
  . Le déblocage est automatique après confirmation du paiement.
</p>
```

Add back the post-success explainer card (below the pay button):

```tsx
{payStatus === 'success' && (
  <div className="mt-3 p-3 rounded-md bg-success-bg/60 border border-success/30 flex items-start gap-2">
    <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" aria-hidden />
    <div className="text-[0.78rem] text-success leading-snug">
      <p className="font-semibold">Paiement enregistré.</p>
      <p className="mt-1">
        Votre accès sera rétabli automatiquement dès la
        confirmation de FedaPay. Vous pouvez laisser cette page
        ouverte.
      </p>
    </div>
  </div>
)}
```

### Step 4 — Revert the Firestore rule

Replace the loose rule in `firestore-6g.rules`:

```
match /ecole/subscription {
  allow read: if true;
  allow write: if isAdmin() || isSaaSMaster();
}
```

…with the strict version:

```
match /ecole/subscription {
  allow read: if true;
  allow write: if isSaaSMaster();
  allow create: if isAdmin()
    && request.resource.data.keys().hasOnly(['hasRequestedUnlock'])
    && request.resource.data.hasRequestedUnlock == true;
  allow update: if isAdmin()
    && request.resource.data.diff(resource.data).affectedKeys()
       .hasOnly(['hasRequestedUnlock'])
    && request.resource.data.hasRequestedUnlock == true;
  allow delete: if isSaaSMaster();
}
```

Make sure this rule comes BEFORE the `match /ecole/{document=**}` catch-all.

### Step 5 — Update `isSaaSMaster()` UID per school

In `firestore-6g.rules`:

```
function isSaaSMaster() {
  return request.auth != null
    && request.auth.uid == 'YOUR_UID_IN_THIS_SCHOOLS_FIREBASE_PROJECT';
}
```

Your Firebase Auth UID is DIFFERENT for each Firebase project. For each school:

1. Log in to that school's RT-SC once as admin (mints your UID in that project)
2. Firebase Console → Authentication → Users → find your email → copy UID
3. Paste into that school's `firestore.rules` on line with `request.auth.uid ==`
4. Deploy: `firebase deploy --only firestore:rules`

(Consider using a Custom Claim approach in a future polish phase to avoid this per-school UID editing.)

### Step 6 — Deploy everything

```bash
# From each school's folder
firebase deploy --only hosting,firestore:rules,functions
```

### Step 7 — Test the full flow on a sandbox school

Before any real school goes live:

1. Create a throwaway Firebase project
2. Deploy everything to it
3. Configure a FedaPay sandbox key + webhook URL pointing at the deployed function
4. Try to bypass: open DevTools on the LockedPage, try `setDoc` with a forged deadline → should be rejected
5. Make a real sandbox FedaPay payment → deadline should extend automatically via webhook
6. Verify the vendor command center shows the updated deadline

### Step 8 — Delete this file

Once all steps are complete and verified, delete `🚨 SECURITY-TODO-BEFORE-DEPLOY.md` from the repo root. Its existence is a big red flag that the codebase is in an insecure dev state.

---

## Verification checklist

Before deploying, tick each:

- [ ] Firebase project upgraded to Blaze plan
- [ ] FedaPay webhook Cloud Function deployed
- [ ] Webhook URL configured in FedaPay dashboard for this school
- [ ] Per-school webhook secret stored in Firebase function config
- [ ] `LockedPage.tsx` reverted to secure version
- [ ] `firestore.rules` reverted to secure version
- [ ] `isSaaSMaster()` UID updated for this school's Firebase project
- [ ] F12 deadline-write attempt rejected (permission-denied error)
- [ ] Sandbox FedaPay payment triggers auto-unlock (via webhook)
- [ ] This file deleted

---

## Why we accepted this trade-off

Blaze requires a card. No card = no webhook. No webhook = no secure auto-unlock.

The options were:
- **(A)** Insecure auto-unlock on localhost for fast dev → secure it later
- **(B)** Secure manual-unlock on localhost → can't test pay flow easily
- **(C)** Wait until a card is available → delays all other work

Ludosky chose (A). This file exists so future-Ludosky doesn't forget.

Last updated: 21 April 2026.
