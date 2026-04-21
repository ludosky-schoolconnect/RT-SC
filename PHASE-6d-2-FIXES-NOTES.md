# Phase 6d.2 — three fixes

Three bugs from post-ship testing. Each root-caused and fixed:

## 1. "Créer mon compte caisse" keeps loading after success

### Problem
Caissier signup showed the success toast ("Compte caisse créé…"),
but the submit button's loading spinner kept spinning.

### Root cause
In `CaisseSignupForm.submit()`, `setSubmitting(true)` fires at the
start, `setSubmitting(false)` only ran on the error path. The
success path relied on the parent's useEffect to unmount the form
via a navigation — but when the profil is still `en_attente`, the
useEffect shows a toast and STAYS on the signup surface, leaving
the button spinner running indefinitely.

### Fix
Reset `setSubmitting(false)` in the success path too. The navigation
(or en-attente redirect) still happens when/if ready, but the
button no longer pretends to still be working.

Same latent issue existed in `ProfAuth.tsx` — fixed there too.

## 2. Caissier login while en_attente showed nothing

### Problem
A caissier who tried to log in before admin approval got signed in
silently, then nothing happened — they stayed on the login screen
wondering if their click worked.

### Root cause
`CaisseAuth` useEffect detected `statut === 'en_attente'` and
showed a toast but did NOT navigate. The `ProfAuth` equivalent
navigates to `/prof/en-attente` which is the correct behavior.

### Fix
`CaisseAuth` now navigates to `/prof/en-attente` on en_attente
login. That page is already role-aware (Phase 6d.2 Turn 2) — it
greets caissiers with "Votre compte **caisse** a bien été créé"
and auto-redirects to `/caissier` once admin flips statut to
`actif`.

## 3. Role picker + class assignment don't reflect mutations

### Problem
When admin changes a prof's role or assigns classes, the live
Firestore write succeeds but the UI keeps showing the OLD state
until the modal is closed and reopened.

### Root cause (after proper diagnosis)
Not a cache race, not a snapshot ordering issue. The cache was
updating correctly — but the MODAL itself was holding a stale
reference.

`ProfsTab` derived `detailFor` via `useMemo` from the live `profs`
list, passed it as a prop to the modal. The memo should recompute
when `profs` changes. In theory, React Query re-renders subscribers
on cache updates.

In practice, something in the subscribe/notify chain was eating the
re-render. Regardless of WHY, the fix is more robust than chasing
the why: have the modal subscribe directly to the live cache and
look up the prof by ID every render.

### Fix
`ModalProfDetail` now:
1. Receives `prof` as a prop (for the initial open + fallback if
   the prof is deleted mid-open)
2. Calls `useProfs()` itself
3. On every render, looks up the current prof by ID in the live
   profs list
4. Uses that live copy everywhere (`prof.role`, `prof.classesIds`,
   `prof.matieres`) for display

Same fix applied to `ModalAssignClasses`.

### useEffect gating
The matières + selected-classes states initialize from `prof` on
modal open. But if we resync on EVERY `prof` change, admin's
in-progress edits get clobbered whenever onSnapshot fires.

So the useEffects that initialize local state are gated on
`prof?.id` only (modal opened for a DIFFERENT prof) — not on any
other prof field. Result:
- Modal opens → local state hydrates from prop
- Admin edits matières → local state diverges from prop
- Onsnapshot fires (other device updated something) → local state
  preserved, admin's edit intact
- Admin closes + reopens modal → local state re-hydrates from
  fresh prop

This is the right behavior: admin's active keystrokes beat
background cache updates.

### Why stacked modals work too
When admin assigns classes via the assign modal (which is stacked
on top of the detail modal):
1. Assign modal submits → cache updates → assign modal closes
2. Detail modal is still mounted underneath
3. Detail modal reads live prof from cache → classes badges
   immediately show the new assignment

No "close and reopen" anymore.

## Files changed

- `src/routes/auth/CaisseAuth.tsx` — submitting reset on success,
  en_attente navigation
- `src/routes/auth/ProfAuth.tsx` — submitting reset on success
- `src/routes/admin/tabs/profs/ModalProfDetail.tsx` — live cache
  lookup + id-gated useEffect
- `src/routes/admin/tabs/profs/ModalAssignClasses.tsx` — same
  pattern

## Test

1. Apply + refresh
2. **Bug 1**: Log out → Welcome → Personnel → Caissier → Inscription.
   Fill form, submit. Toast shows "Compte caisse créé…". **Button
   spinner stops** (it doesn't keep loading).
3. **Bug 2**: Immediately try to log in with that same en_attente
   account at the same login screen. You should be navigated to
   the "approbation en cours" page with "Votre compte **caisse**"
   — no longer silently nothing.
4. **Bug 3a** (role picker): Admin → Profs tab → open any prof's
   detail → click a different role button. The checkmark/active
   state should move to the new role **immediately**, no need to
   close the modal.
5. **Bug 3b** (class assign): In the detail modal, click
   "Modifier" next to "Classes assignées" → assign modal opens →
   check a new class → Save. Assign modal closes. **Back on the
   detail modal**, the new class should already appear in the
   badges list. No need to close and reopen.

## What this patch is NOT

- No rules changes
- No new features
- Just three targeted fixes to existing behavior

## Roadmap

- ✅ Phase 6d.2 Staff login redesign + these fixes
- **NEXT: Phase 6e — Nav redesign** (kill Plus menu, fold into
  Pédagogie tab)
- 6f — SaaS kill switch
- 6g — Vendor command center
