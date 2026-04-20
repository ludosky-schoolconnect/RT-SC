# Phase 5c.2 — Emploi du temps: read views (prof, élève, parent)

## What this phase ships

The three read-only views that consume the /seances collection built in 5c.1:

- **Prof** → "Mon emploi" tab between Notes and Annonces
- **Élève** → "Emploi" tab between Bulletins and Plus
- **Parent** → "Emploi" tab between Bulletins and Plus

All three reuse the shared `EmploiGrid` component from 5c.1, so the visual
behavior — day grouping, "Aujourd'hui" emphasis, "En cours" badge — is
identical everywhere. Only the filter and the subtitle differ per role.

## Files

### New

- `src/routes/prof/tabs/emploi/EmploiProfTab.tsx`  
  Filters seances by `user.uid`. Subtitle per card = class name (the prof
  knows their matière; they need to know *whose* class is coming up).
  Empty state when no séances are assigned.

- `src/routes/_shared/emploi/EmploiClasseTab.tsx`  
  Class-scoped read tab, shared between élève and parent. Takes a
  `classeId` prop + optional `intro` caption (élève: "Ma semaine",
  parent: "Semaine de {firstName}"). Subtitle per card = prof name.
  **Salle fallback**: if a séance has no `salle` override, falls back to
  `Classe.salle` from the classes registry — so élèves/parents always
  see a room number even if admin left it blank.

### Modified

- `src/routes/prof/ProfDashboard.tsx`  
  Added `{ id: 'emploi', label: 'Emploi', icon: <CalendarClock/> }` between
  Notes and Annonces. Wired case in the switch.

- `src/routes/eleve/EleveDashboard.tsx`  
  Added Emploi tab between Bulletins and Plus. Updated PlusPlaceholder copy
  ("emploi du temps" removed from "coming soon" list since it's now live).

- `src/routes/parent/ParentApp.tsx`  
  Added Emploi tab. Uses the same ChildSwitcherStrip pattern as Bulletins
  so multi-child parents can switch kids without leaving the tab.

## Why one component for élève AND parent

Both render the same data (their class's schedule) with the same filter
(by `classeId`). The only difference would be the intro caption — and
that's a prop. Factoring one `EmploiClasseTab` into `_shared/` matches
the pattern we already use for `BulletinsTab` and `AccueilTab`.

The parent-side child switcher wraps the tab in the ParentApp layer, so
`EmploiClasseTab` itself stays single-purpose and testable.

## Data flow (no new listeners)

`useAllSeances()` is already running (started by the admin tab in 5c.1
and by the cache hydration in any dashboard that mounts it). The read
tabs just subscribe to the same TanStack Query cache and memo-filter.
No duplicate Firestore listeners, no extra reads.

If a prof opens their Emploi tab BEFORE any admin tab has mounted in the
same session, `useAllSeances()` is called by the read tab and kicks off
the listener — same pattern, same cost.

## Firestore security impact

No new rules needed. The existing `/seances/** { allow read: if true }`
rule from 5c.1 covers everyone:

- Profs authenticated → read
- Élèves/parents on anonymous auth → read (rule is `if true`)

Writes stay restricted to `isStaff()`, which the read tabs never invoke.

## Design consistency

- **"Aujourd'hui" emphasis** — Today's jour header goes navy with a pill
  ("Aujourd'hui"). Works in all 4 surfaces (admin + 3 read views).
- **"En cours" badge** — Séance currently running gets a green badge.
  `isSeanceNow()` is pure and time-aware; it re-evaluates on every render
  of the tab. Not a real-time ticker (we don't want to force a re-render
  every second), but any interaction (tab switch, navigation, etc.) will
  recompute it.
- **Empty days** — In read views, days with no séance are hidden entirely
  (emptyDayText=null) so the Sunday ghost day doesn't show. Admin keeps
  the "Journée libre." placeholder for every day to signal where new
  séances can land.

## Testing priorities

1. **Prof sees only their own séances**: log in as a prof, Emploi tab
   should show only classes they teach. Switch profs, verify the filter
   updates.

2. **Cross-class prof**: if a prof teaches in multiple classes, all
   classes should appear with correct class-name subtitles per card.

3. **Élève sees their class's full schedule**: including séances from
   profs that aren't their PP. Subtitle should be the prof name.

4. **Parent multi-child**: switch between children, Emploi tab should
   swap to the new child's class. Child switcher strip should appear
   at the top only when 2+ children.

5. **Salle fallback**: create a séance in admin WITHOUT setting salle;
   verify that élève/parent still see the classe's default salle on the
   card.

6. **Empty state copy** — new prof with zero séances sees the right
   message ("Aucun cours programmé. Dès que la direction..."); class
   with zero séances sees "L'emploi du temps sera publié par la
   direction..."

7. **"En cours"** — same reproduction as 5c.1: set device time to a
   weekday during a séance's window, open the Emploi tab on any role
   — green badge should appear on the right card.

## What's NOT in this phase

- **"Prochain cours" Accueil widget** — Phase 5c.3 (optional polish).
  Would show a single-card preview of the next upcoming séance on the
  élève/parent/prof Accueil.
- **Week navigation** — currently just one canonical week; no "Lundi
  prochain" / "semaine dernière" UX. If CEG HOUETO needs historical
  views later, we'd add a week offset control.
- **Push notifications for next cours** — far future.
