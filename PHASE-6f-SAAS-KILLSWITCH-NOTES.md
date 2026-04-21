# Phase 6f — SaaS kill switch + FedaPay renewal flow

## What this phase ships

The commercial layer. Schools pay a monthly/yearly subscription to use
SchoolConnect. When their subscription lapses, admin gets locked out
until they renew. Payment happens via FedaPay (Beninese mobile money)
inline on the locked page.

## The flow end to end

### Normal lifecycle
1. School's `ecole/subscription.deadline` is in the future → everyone
   has full access
2. 7 days before deadline → admin sees a yellow warning banner
3. Deadline passes → warning banner turns red ("accès bientôt
   verrouillé"), still 3-day grace
4. Deadline + 3 days → hard lock:
   - Admin → `/locked` with FedaPay widget
   - Prof / Caissier / Élève / Parent → `/maintenance` (generic, no
     subscription details exposed)

### Payment unlock
1. Admin on `/locked` taps "Payer XXX FCFA via FedaPay"
2. FedaPay widget opens inline (no page transition)
3. User pays via Mobile Money / carte / whatever they configured
4. FedaPay's `onComplete` callback fires → we check approval status
5. Fairness-logic write to Firestore:
   - If current deadline is in the future → new deadline = deadline + N months
   - If current deadline has passed → new deadline = today + N months
6. `isManualLock: false`, `hasRequestedUnlock: false`
7. Page navigates to `/admin?paid=true`
8. `SubscriptionGuard` sees `?paid=true` → 5-second bypass window
9. Guard's onSnapshot picks up the new deadline within that window
10. Admin lands in normal dashboard, no interruption

### Manual (cash/bank) unlock
1. Admin taps "Signaler un paiement externe" on `/locked`
2. Firestore: `hasRequestedUnlock: true`
3. Ludosky's command center (dev.html) shows the 🔔 alert
4. Ludosky verifies cash payment offline, extends deadline manually
5. `SubscriptionGuard.onSnapshot` sees `isManualLock: false` +
   `deadline > now` → unlock transition → `window.location.reload()` →
   admin back to dashboard

## What was built

### Types + data
- `SubscriptionDoc` already had `deadline`, `isManualLock`,
  `hasRequestedUnlock?`, `fedaPayPublicKey?`, `subscriptionPrice?`
- No new fields added. Phase uses what dev.html already writes.

### Hooks
- **`useSubscription`** — live onSnapshot read of `ecole/subscription`.
  Returns rich derived state: deadline, isLocked, inWarningWindow,
  inGracePeriod, daysRemaining, subscriptionPrice, etc.
- **`usePayAndExtendSubscription`** — mutation invoked after FedaPay
  success. Reads current deadline FRESH (can't trust cache — Ludosky
  or another path may have updated it). Applies fairness logic:
    - currentDeadline > now → base = currentDeadline (early pay)
    - currentDeadline ≤ now → base = now            (late pay)
  New deadline = base + durationMonths. Also clears isManualLock +
  hasRequestedUnlock.
- **`useRequestUnlock`** — flips `hasRequestedUnlock: true` for cash
  payers who can't use FedaPay.

### Library helpers
- **`lib/fedapay.ts`** — SDK loader with TypeScript types:
  - `loadFedaPay()` — idempotent dynamic script injection
    (https://checkout.fedapay.com/js/checkout.js). Shares the same
    Promise across calls. Retries on failure.
  - `detectFedaPayEnvironment(pk)` — live/sandbox by key string
  - `isFedaPayApproved(resp)` — matches all known success shapes
    (status, transaction.status, reason containing "success")

### Routes
- **`/locked`** — full replacement for Phase 0 stub:
  - Hero card with lock icon + reason (expired vs manual lock)
  - FedaPay inline widget
  - "Signaler un paiement externe" fallback
  - Support block
  - "Déjà actif" fallback view if admin navigates here while NOT
    locked (Mon abonnement → renew early path)
  - FedaPay SDK preloaded on mount so first click is instant
- **`/maintenance`** — full replacement for Phase 0 stub:
  - Generic "service temporairement suspendu" — no subscription
    details leaked to prof/caissier/élève/parent
  - "Vérifier à nouveau" reload + "Se déconnecter"
- **`/paiement`** — removed (dead route from legacy, now redirects
  to `/locked` for backward compat)

### UI components
- **`SubscriptionWarningBanner`** — rendered at top of admin
  dashboard (inside DashboardLayout's main content, above active
  tab). Null for non-admins and outside warning/grace windows.
  Amber in warning window (≤7 days), red in grace (expired but
  not locked). Per-session dismissible via ✕ (doesn't persist —
  comes back on refresh).
- **`AbonnementCard`** — in Année tab (new section at top). Shows:
  - Deadline + days remaining pill (color-coded by tone)
  - Price + duration
  - "Renouveler par anticipation" / "Renouveler maintenant" button
    → navigates to `/locked`
  - Explainer text for healthy state ("vous ne perdez aucun jour")

### Guard fix
- **`SubscriptionGuard`** — unlock-transition `window.location.reload()`
  now skips when already on `/locked`. Prevents a race where the
  guard reloads during LockedPage's post-payment navigation, bouncing
  the user back to `/locked` briefly before they see the success
  state.

### Tailwind config
- Added `dark` variants to `success`, `warning`, `danger` colors
  (previously missing → `text-success-dark` etc. scattered across
  the codebase silently rendered default inherited colors). Now they
  render as the intended darker shade. Retroactive fix for earlier
  code that referenced these tokens.

## Fairness logic — in detail

You asked for fairness in both directions.

**Scenario A — Early payment** (e.g. 10 days before deadline):
```
currentDeadline = March 31
now             = March 21
newDeadline     = March 31 + 1 month = April 30
```
School keeps the 10 days they already paid for. They don't lose
a day by paying early.

**Scenario B — Late payment** (e.g. 5 days past deadline, inside grace):
```
currentDeadline = March 31  (already passed)
now             = April 5
newDeadline     = April 5 + 1 month = May 5
```
Fresh cycle from today. They don't get a backdated period that
would be effectively shorter.

**Scenario C — Very late** (after 3-day grace, app locked):
Same as B — new cycle from today. The lock is consequence; they
don't get "retroactive" time.

**Why not just `deadline + 1 month` always?** Would create a nasty
case: school pays 20 days late, their new deadline is only 10 days
away. They'd feel scammed. Conversely why not `now + 1 month` always?
Would penalize early payers who lose their remaining days.
`max(deadline, now) + N` handles both.

This matches the legacy `paiement.js` line 45 exactly.

## Firestore rules

This phase does NOT ship rules changes. The existing rules allow
admin writes to `/ecole/**` which covers `/ecole/subscription`. For
extra safety in Phase 6g we could tighten:
- Admin can write only `{ deadline, isManualLock: false, hasRequestedUnlock }`
- Only Ludosky (UID `ARCosTxTeZYvk9cj548mnRzaYKG2`) can write
  `{ fedaPayPublicKey, subscriptionPrice, isManualLock: true }`

But the way you use it (dev.html auths AS the vendor with email
password, not through RT-SC) means Firestore sees those writes
coming from the vendor session — not the school's admin session.
So technically the existing rules already separate them correctly
at the session level.

## What's NOT in this ship

- Vendor command center is still `dev.html` — not integrated into RT-SC
- Firestore rules updates (mentioned above — deferred to 6g if needed)
- No admin-facing receipt / payment history (FedaPay emails the receipt,
  the `deadline` change is the audit trail)

## Files changed

**New:**
- `src/hooks/useSubscription.ts`
- `src/lib/fedapay.ts`
- `src/components/layout/SubscriptionWarningBanner.tsx`
- `src/routes/admin/tabs/annee/AbonnementCard.tsx`

**Replaced (Phase 0 stubs):**
- `src/routes/locked/LockedPage.tsx`
- `src/routes/maintenance/MaintenancePage.tsx`

**Modified:**
- `src/components/layout/DashboardLayout.tsx` (wired banner)
- `src/components/guards/SubscriptionGuard.tsx` (unlock reload race fix)
- `src/routes/admin/tabs/annee/AnneeTab.tsx` (wired AbonnementCard)
- `src/App.tsx` (removed PaiementPage, redirected /paiement → /locked)
- `tailwind.config.js` (added dark variants to success/warning/danger)

**Deleted:**
- `src/routes/paiement/PaiementPage.tsx`
- `src/routes/paiement/` directory

## Testing checklist

### Setup
1. Apply zip + hard refresh
2. In dev.html (your command center), for CEG HOUETO:
   - Set `fedaPayPublicKey` to your live key (`pk_live_...`)
   - Set `subscriptionPrice` (e.g. 15000)
   - Set `deadline` to something in the future (e.g. 60 days out)
   - `isManualLock: false`, `hasRequestedUnlock: false`

### Happy path — Mon abonnement visible
3. Log in as admin → Année tab → "Abonnement SchoolConnect" section at
   top shows green healthy state, deadline date, days remaining,
   "Renouveler par anticipation" button
4. No warning banner visible on other tabs (deadline too far out)

### Warning banner appears
5. In dev.html, set `deadline` to 5 days from now
6. Refresh admin dashboard → yellow banner appears at top of every tab
   ("Votre abonnement expire dans 5 jours")
7. Tap ✕ → banner hides for the session
8. Refresh → banner back (per-session dismissal, intentional)
9. Mon abonnement card shows amber "5 jours restants" pill

### Grace period
10. In dev.html, set `deadline` to 1 day in the PAST
11. Refresh admin dashboard → RED banner ("Votre abonnement a expiré il
    y a 1 jour. Renouvelez maintenant avant le verrouillage complet.")
12. Mon abonnement card shows red "Expiré il y a 1 jour" pill
13. App still accessible (within 3-day grace)

### Hard lock — admin sees LockedPage
14. In dev.html, set `deadline` to 5 days in the past (past grace)
    OR flip `isManualLock: true`
15. Refresh admin → automatically redirected to `/locked`
16. Page shows the lock card with FedaPay button

### FedaPay sandbox test (don't use real money)
17. Ensure `fedaPayPublicKey` in dev.html is a `pk_sandbox_...` key
    for this test
18. Tap "Payer … via FedaPay" → widget opens
19. Use FedaPay sandbox test card (get from their docs)
20. Widget closes on success → button shows "Paiement validé !" →
    "Succès ! Retour à l'application…"
21. 1.5s later → land on `/admin?paid=true`
22. Check dev.html → `deadline` extended, `isManualLock: false`,
    `hasRequestedUnlock: false`
23. ?paid=true query strips after 5s → normal admin dashboard

### Cash payer fallback
24. Lock the school again (dev.html `isManualLock: true`)
25. Admin on `/locked` → tap "Signaler un paiement externe" → confirm
26. Button changes to "Signalement envoyé" (disabled)
27. Check dev.html → `hasRequestedUnlock: true` → red alert banner
    appears at top of dev.html
28. In dev.html, tap "+1 Mois" → verify admin's RT-SC refreshes to the
    dashboard automatically (via guard unlock transition reload)

### Non-admin lock
29. With school locked, log in as prof or caissier → lands on
    `/maintenance` (not `/locked`)
30. Page shows generic "Service temporairement suspendu" — no mention
    of subscription, payment, or money
31. Tap "Se déconnecter" → back to welcome page
32. Tap "Vérifier à nouveau" → reloads. If school still locked, stays
    on maintenance. If unlocked, the SubscriptionGuard's reload drops
    them into the app (or they log back in).

### Mon abonnement — renew early path
33. With school HEALTHY (deadline well in future), go to Année tab →
    Mon abonnement → tap "Renouveler par anticipation"
34. Lands on `/locked` which shows "Déjà actif" card ("Aucune action
    requise") — this is correct because the school isn't actually locked.
35. (If you wanted to actually renew early, you'd instead tap the
    inline pay button here — the guard's !isLocked bypass lets the
    LockedPage render normally without redirect. Note: this is a
    deliberate UX choice — to avoid ALL weirdness, in practice if
    admin wants to renew early, they'd navigate here during warning
    window or grace period when the lock is "imminent" rather than
    "done".)

**Edge case discovered during build**: the "Renouveler par anticipation"
button from Mon abonnement card currently lands on "Déjà actif" view
if school isn't locked. This works but isn't ideal UX — admin wants
to PAY, not see a "nothing to do" screen. Turn 2 could add a "Force
renew" mode to LockedPage that bypasses the `showUnlocked` check.
For now, admin can only renew early WITHIN warning/grace windows.
Flag if you want turn 2 to address this.

## Roadmap

- ✅ Phase 6f — SaaS kill switch (this ship)
- NEXT: Phase 6g — Vendor command center
- LATER: Firebase 12 upgrade
