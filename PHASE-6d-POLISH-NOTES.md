# Phase 6d — polish patch (admin/caissier split corrections)

Four issues from testing Phase 6d. Each one addressed:

## 1. Finances config moved back to admin

### Problem
The caissier dashboard's Terminal tab was showing the scolarité + gratuité
configuration card. Caissier shouldn't set school-policy amounts — that's
admin's job. Caissier just applies them.

### Fix
- `FinancesAdminTab` stripped down to search + paiement flow only
  (no Config card, no Bilan card)
- `FinancesConfigCard` mounted in admin's Année tab under new
  "Frais de scolarité" subsection
- Caissier has no UI to edit fees; Firestore rules (already in 6d)
  back this up at the server — `/ecole/finances/config` is admin-write
  through the `/ecole/**` rule

## 2. Bilan no longer duplicated on Terminal tab

### Problem
Caissier's Bilan tab and Terminal tab both rendered `BilanGlobalCard`.

### Fix
Removed BilanGlobalCard from FinancesAdminTab (same cleanup as above).
Now Bilan lives only in the dedicated tab.

## 3. Role picker reflects selection instantly (no reopen needed)

### Problem
After changing a prof's role in ModalProfDetail, the picker didn't
update to show the new selection until the modal was closed and
reopened.

### Root cause
A race between two writers to the `['profs']` TanStack cache:

- `useUpdateProfRole.onMutate` wrote the optimistic value
- `useProfs`'s `onSnapshot` listener would fire a moment later with
  the PRE-mutation Firestore state (old role), overwriting the
  optimistic value
- Then the server confirmed, Firestore fired a second snapshot with
  the new role — but by then the user was confused or had moved on

### Fix
Removed the optimistic `onMutate` from `useUpdateProfRole`. Let
onSnapshot drive the cache exclusively.

The mutation's `mutationFn` awaits `updateDoc`, so when the promise
resolves, Firestore has already committed the write. The next
onSnapshot fire (hundreds of ms later) carries the new role —
fast enough to feel instant, without racing anything.

## 4. Caissier's Inscriptions tab = Guichet only

### Problem
Caissier was seeing the full Demandes + Rendez-vous + Guichet
segmented control. They only need Guichet (admin handles
approval + scheduling).

### Fix

**Admin side** (`InscriptionsAdminTab`):
- Rewritten as TWO modes only: Demandes + Rendez-vous
- Guichet mode removed
- Import of GuichetView removed
- Description reworded: "Le caissier finalisera l'inscription le jour
  du rendez-vous."

**Admin Plus menu** — Inscriptions tile restored (I had removed it
when moving Guichet to caissier, but admin still needs Demandes +
Rendez-vous):
- Tile description: "Demandes + rendez-vous (le guichet est côté caissier)"
- Subtitle of Plus menu restored to include Inscriptions

**Caissier side** (`CaissierDashboard`):
- Tab relabeled "Guichet" (was "Inscriptions")
- Renders `<GuichetView />` directly, wrapped in a proper `<Section>`
  with SectionHeader

### Result
- Admin: Plus → Inscriptions → Demandes / Rendez-vous
- Caissier: Guichet tab → direct guichet surface, no sub-modes

## Files changed

- `src/hooks/useProfsMutations.ts` — drop onMutate from
  `useUpdateProfRole`
- `src/routes/admin/AdminDashboard.tsx` — restore UserPlus import,
  InscriptionsAdminTab import, inscriptions tile + surface
- `src/routes/admin/tabs/inscriptions/InscriptionsAdminTab.tsx` —
  Guichet mode removed; admin-only segmented control
- `src/routes/admin/tabs/annee/AnneeTab.tsx` — new "Frais de
  scolarité" subsection with FinancesConfigCard
- `src/routes/admin/tabs/finances/FinancesAdminTab.tsx` — search +
  paiement only (Config + Bilan cards removed, kicker updated)
- `src/routes/caissier/CaissierDashboard.tsx` — tab label "Guichet",
  renders `<GuichetView />` directly with its own SectionHeader;
  Terminal surface no longer has duplicate kicker

## Test

1. Apply zip, hard refresh, log in as **admin**.
2. Go to Plus — should see 4 tiles: Inscriptions / Emploi / Annonces /
   Année.
3. Tap Inscriptions → verify only 2 modes (Demandes + Rendez-vous),
   no Guichet.
4. Go to Plus → Année → scroll to "Frais de scolarité" section →
   verify the config card is there (scolarité, fraisAnnexes,
   gratuité toggles).
5. Now log in as **caissier**.
6. Terminal tab → verify NO config card at top, only the
   name-override header + search interface.
7. Bilan tab → verify BilanGlobalCard is there (was the only Bilan
   surface already, but just confirm).
8. Guichet tab → verify it goes directly to the guichet flow (no
   Demandes / Rendez-vous buttons at the top).
9. Log back in as admin, open Profs → tap a prof → try changing
   their role. Picker should reflect the new selection INSTANTLY
   (no reopen needed). Confirm this by switching between Caissier
   → Professeur → Admin a few times.

## What's NOT in this patch

- No rules changes (6d rules still apply as-is)
- No new features
- No changes to other surfaces
