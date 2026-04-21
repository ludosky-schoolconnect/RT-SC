# Phase 6d.2 — staff login redesign · Turn 1

**CHECKPOINT** — partial shipment. Caissier signup flow is NOT wired yet
(that's Turn 2). This turn ships:

1. The "Section is not defined" bug fix for the caissier Terminal tab
2. New caisse passkey infrastructure (types, generator, regen mutation)
3. Dual-passkey admin panel (prof + caisse side-by-side)
4. New `/auth/personnel` chooser page
5. Welcome page points at `/auth/personnel` instead of `/auth/prof`
6. `/auth/prof` kept as backward-compat redirect to the chooser

## Bug fix — Terminal tab

### Problem
Caissier Terminal tab threw "Section is not defined" and showed
the "Une erreur est survenue" error card.

### Root cause
Earlier cleanup of unused imports in `FinancesAdminTab.tsx` removed
the `Section`/`SectionHeader` imports — but the component still used
`<Section>` in its render.

### Fix
Re-added `import { Section, SectionHeader } from '@/components/layout/Section'`.

## New infrastructure — caisse passkey

### Data model
`SecuriteConfig.passkeyCaisse?: string` — optional field alongside the
existing `passkeyProf`. Both are 6-digit codes. If `passkeyCaisse` is
undefined (legacy schools, fresh installs), caissier signup falls back
to `passkeyProf` so nothing breaks during rollout.

### Generator
`genererPasskeyCaisse()` in `src/lib/benin.ts` — same 6-digit format
as `genererPasskeyProf()` but a separate function for clarity and
future divergence if we ever want different formats.

### Mutations
- `useRegeneratePasskeyCaisse()` — writes `passkeyCaisse` onto
  `ecole/securite`, invalidates the `['ecole', 'securite']` query
- `useRegeneratePasskeyProf()` — UPGRADED to also invalidate the
  same query (previous version didn't; the PasskeyProfPanel had
  to call invalidate manually)

## Dual-passkey admin panel

`PasskeyProfPanel` rewritten. Now renders a grid of two cards:

- **Code professeur** (gold/KeyRound icon) — existing behavior
- **Code caisse** (navy/Wallet icon) — new card

Each card has:
- The 6-digit code displayed (or a "not set" message)
- A copy button (copies to clipboard)
- A regenerate button (with a role-specific confirmation dialog)

When `passkeyCaisse` isn't set, the card shows a soft hint: "Non
défini — le code professeur fera office par défaut." This explains
why caissier signup still works even before admin generates a
distinct caisse code.

## Routing changes

### New routes
- `/auth/personnel` — the new chooser screen
- `/auth/personnel/prof` — existing ProfAuth mounted here

### Kept for compat
- `/auth/prof` — now renders `PersonnelChoice` (the chooser). Anyone
  with a stale bookmark, WhatsApp link, or muscle memory lands on
  the chooser and picks the right role. No hard break.

### Coming in Turn 2
- `/auth/personnel/caisse` — the new caissier signup/login/forgot
  flow (doesn't exist yet; clicking Caisse on the chooser today
  will 404)

## Welcome page

The staff tile is relabeled to "Personnel de l'école" (was
"Professeur") with a new description "Professeurs et caissiers :
accéder à mon espace." It now links to `/auth/personnel`.

## What's missing (Turn 2)

- `/auth/personnel/caisse` route + `CaisseAuth` component
  (signup/login/forgot tabs like ProfAuth, minus matières, verifies
  against passkeyCaisse with passkeyProf fallback)
- Caissier signup mutation that stamps `role: 'caissier'` + `statut:
  'en_attente'` at doc creation (no manual role change needed after
  approval)
- Forgot password UI tightening — explicit label "Tapez l'email avec
  lequel vous vous êtes inscrit"

## What's missing (Turn 3)

- PendingProfsList visual distinction per role (icon + label)
- Notes + full test plan

## Files changed

### New files
- `src/routes/auth/PersonnelChoice.tsx` — the chooser

### Modified
- `src/lib/benin.ts` — added `genererPasskeyCaisse`
- `src/types/models.ts` — `SecuriteConfig.passkeyCaisse?: string`
- `src/hooks/useProfsMutations.ts` — new `useRegeneratePasskeyCaisse`;
  `useRegeneratePasskeyProf` now invalidates the query
- `src/routes/admin/tabs/profs/PasskeyProfPanel.tsx` — dual cards
- `src/App.tsx` — new routes wired
- `src/routes/welcome/WelcomePage.tsx` — staff tile relabeled
- `src/routes/admin/tabs/finances/FinancesAdminTab.tsx` — Section
  import restored (bug fix)

## Test

1. Apply zip, hard refresh
2. Log in as caissier → Terminal tab → **no more error card**, search
   UI renders normally
3. Log in as admin → Profs tab → scroll down — you should see TWO
   passkey cards instead of one. The "Code caisse" card may show
   "Non défini" if you haven't generated one yet.
4. Click "Générer un code distinct" on the caisse card → a 6-digit
   code appears, toast shows the new value
5. Check Firestore: `/ecole/securite` should have BOTH `passkeyProf`
   and `passkeyCaisse`
6. Log out → go to Welcome page → the staff tile now says "Personnel
   de l'école". Tap it → you land on the chooser with two options:
   Professeur / Caissier
7. Tap Professeur → existing signup/login flow works exactly as
   before (now at /auth/personnel/prof)
8. Tap Caissier → **404 expected** (Turn 2 will wire this)
9. Sanity: old URL `/auth/prof` now shows the chooser instead of
   the direct prof form. No hard break for anyone with stale links.

## Roadmap

- ✅ Phase 6d.2 Turn 1 (this ship — infrastructure + chooser)
- **NEXT: Phase 6d.2 Turn 2** — CaisseAuth signup/login/forgot +
  caissier signup mutation
- Phase 6d.2 Turn 3 — PendingProfsList role distinction + ship
- Phase 6e — Sub-modes nav redesign (kill Plus menu)
