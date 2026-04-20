# RT-SC · Phase 3d-i — Année Tab + Bug Fix

The fourth and final admin tab is now functional for everyday work. The destructive year-rollover operations get their own focused phase next (3d-ii) — they're too critical to squeeze in alongside the everyday config editors.

## What's new

| Area | Status |
|---|---|
| Année tab — School identity card | **Functional** (nom / ville / devise) |
| Année tab — Active year card | **Functional** (with format validation + auto-suggest) |
| Année tab — Bulletin config card | **Functional** (Trimestre/Semestre, nbPeriodes, baseConduite) |
| Année tab — Danger zone | Placeholder (rollover ops in Phase 3d-ii) |
| Bug fix | Assign-classes modal no longer auto-closes when opened from prof detail |

## Bug fix details

When you tapped "Modifier" inside a prof's detail modal to open the assign-classes modal, the assign modal sometimes closed itself instantly. Cause: both modals push browser-history entries (mobile back-button trap), and the rapid close→open sequence caused the popstate handler of the new modal to fire on the outgoing event.

**Fix:** the detail modal now stays open underneath the assign modal — they stack instead of swapping. Closing the assign modal returns you to the detail view (cleaner UX too — you can adjust matières and classes in one flow without having to reopen the detail).

## Année tab — what each card does

### 1. Identité de l'établissement
- Edit `nom`, `ville`, `devise`
- Live preview at the bottom of the card showing how it'll look on the welcome page
- Same Firestore doc the welcome page reads from → changes appear instantly
- Save button disabled until you actually change something

### 2. Année scolaire active
- Set `anneeActive` (e.g. "2026-2027")
- Format validated: `AAAA-AAAA` with consecutive years
- "Utiliser : YYYY-YYYY" button auto-suggests the current academic year (Bénin school year starts in October)
- Warning banner appears if no year is set yet ("Définissez-la avant de créer des classes")

### 3. Paramètres des bulletins
- Type de période: Trimestre or Semestre (radio cards)
- Nombre de périodes: 1–4 (auto-defaults to 3 for Trimestre, 2 for Semestre when you switch)
- Note de conduite de base: 0–20, default 20
- Info banner reminds you that changing mid-year affects already-closed bulletins

### 4. Zone dangereuse
- Two rows describing the upcoming operations: transition élèves + final archive
- Both buttons disabled and labeled "Phase 3d-ii"
- This isn't laziness — these operations touch every collection and need a multi-step modal with dry-run preview, which deserves its own phase

## What to test

1. Log in as admin → tap **Année** tab
2. **Identité card**: change the nom, save. Then go to `/welcome` (logout first or open a different tab) — the new name appears in the school identity card
3. **Active year card**: try invalid formats ("2026", "2026-2030", "abc-def") — validation messages appear
4. Tap "Utiliser : YYYY-YYYY" — fills in the current academic year suggestion
5. **Bulletin config card**: switch between Trimestre and Semestre — see the nbPeriodes default change. Try setting baseConduite to 25 — error appears
6. **Bug fix verification**: go to Profs tab → tap any prof → tap "Modifier" next to "Classes assignées". The assign-classes modal should open and stay open. Close it (X or Annuler) — you return to the prof detail modal still open underneath.

## Bonus — multi-school verification

The Active Year auto-suggest uses real "now" via `Date()`, so it'll always be current. Today (April 2026) it suggests `2025-2026` (since we're past September of 2025 and before October 2026, the current school year is still 2025-2026).

## What's NOT in Phase 3d-i

- **Year rollover** (transition élèves + final archive) — Phase 3d-ii
- **À propos CMS editor** — Phase 3d-ii (hidden route at `/__cms/about`, UID-gated, NOT in admin tabs)
- **Matières globales editor** — Phase 4 (it's only needed when you start computing bulletins)
- **Coefficients grid editor** — Phase 4 (same reason)

## Coming next

**Phase 3d-ii** — The two remaining pieces:
1. Year rollover modal — multi-step:
   - Step 1: Select source class
   - Step 2: For each élève, mark Admis/Échoué (or "Abandonné")
   - Step 3: Select destination class for admis
   - Step 4: Dry-run preview ("X admis vers 4ème B, Y échoués maintenus, Z abandonnés archivés")
   - Step 5: Confirm + execute (with progress indicator since this can take 30+ seconds for big schools)
2. Final archive operation:
   - Summary preview of what will be archived/reset
   - Multi-tap confirm
   - Progress indicator
   - Triggers vigilance_ia purge, presence reset, passkey regen, profPrincipalId clear
3. À propos CMS editor at hidden URL `/__cms/about`:
   - UID gate (404 for everyone except your `VITE_OWNER_UID`)
   - Markdown editor with live preview side-by-side
   - "Brouillon / Publié" toggle
   - Save → writes `cms/about` doc → public `/a-propos` page picks it up immediately
