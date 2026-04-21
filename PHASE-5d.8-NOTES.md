# Phase 5d.8 — Appels du jour + declarations/marked split

## What this phase ships

Your redesign applied in full:

1. **New "Appels du jour" view** — per-class × per-matière grid of
   today's marked absences. Each matière row shows `N/total` absent
   with élève list expansion. Both admin and prof use this (prof sees
   only their teaching classes).

2. **Triage école reverts to declarations-only**. No more marked
   absences mixed in. Admin doesn't scroll past prof-marked facts to
   find the few declarations needing review.

3. **Archive adopts the same grouped structure** but with an outer
   grouping by date:
   ```
   Date
     Class
       Matière (N/total absents)
         Élèves
   ```

4. **Vie scolaire switcher reshaped**:
   - Admin: Appels du jour | Déclarations | Par classe | Archive
   - Prof:  Appels du jour | Par classe

## Why this is the right split

Declarations and marked absences are genuinely different data:

| Dimension       | Marked (appel)              | Declared (élève/parent)     |
|-----------------|-----------------------------|------------------------------|
| Origin          | Prof during class           | Élève/parent in advance      |
| Time scope      | A specific class period     | A range of hours/day         |
| Matière         | One specific matière        | N/A (full-day event)         |
| Review needed   | No — it's a fact            | Yes — validate/refuse/delete |
| Admin workflow  | Monitor patterns, delete errors | Triage pending requests |
| Storage         | /presences/{date}.{matiere} | /eleves/{}/absences/         |

Mixing them on one surface means:
- Filter UI compromises (class/matière don't apply to declarations)
- Chip semantics blur (was "À traiter" about declarations only? about
  both?)
- Admin eye has to work harder to parse what each row means

Splitting gives each workflow its own appropriate surface with its own
natural filters and actions.

## Appels du jour UX

Card per class that has at least one absence today. Empty classes
don't render (would just be noise). Card shows:

```
┌─────────────────────────────┐
│ 3ème M1                     │   ← navy header, class name + stats
│ 47 élèves · 5 absences      │
├─────────────────────────────┤
│ Mathématiques  3/47  >      │   ← matière rows
│ M. Adjovi                   │     click to expand élève list
│ Français       1/47  >      │
│ Mme. Hounkpe                │
│ SVT            2/47  >      │
│ M. Gnonlonfoun              │
└─────────────────────────────┘
```

Color coding on the count:
- `0` — muted ink-400 (nobody absent, shown for visual balance
  when matière has been called but no absences)
- `< 10%` — warning amber
- `≥ 10%` — danger red

Only rows with `N > 0` are expandable. Zero-absence rows render
without the chevron and don't respond to taps.

Clicking an expanded row shows the élève list with: name, time the
appel was taken, prof who took it, raison (with "raison d'absence
inconnue" fallback), and for admin a Supprimer icon.

## Archive grouped layout

Same structure as Appels du jour but with outer date grouping. Date
header is sticky (CSS `position: sticky; top: 0`) so admin can scroll
through weeks of data while always seeing which date they're looking
at. Each date collapses/expands automatically via the matière rows.

## Surfaces per role

### Admin
- **Appels du jour** (default landing) — today's marked, grouped
- **Déclarations** — self-declared, flat list with statut chips
- **Par classe** — deep-dive per class (unchanged)
- **Archive** — historical marked, grouped by date→class→matière

### Prof
- **Appels du jour** — today's marked for their teaching classes
- **Par classe** — per-class drill-in for their classes

Prof doesn't see Déclarations (those are admin's to review) and
doesn't see Archive (historical data is admin's territory).

## Data flow

Hooks haven't changed:
- `useSchoolMarkedAbsences` — today's marked, school-wide (already
  filters `dateISO < today` from 5d.6)
- `useSchoolAbsences` — declarations, collectionGroup
- `useArchivedAbsences(range)` — archive with date range
- `useDeleteMarkedAbsence` / `useDeleteAbsence` / `useDeleteArchivedAbsence`

The restructure is purely in the view layer — data model stays the
same. Good sign that the underlying primitives were designed right.

## Files

### New

- `src/routes/_shared/absences/AppelsDuJourView.tsx`  
  Per-class × per-matière grouped view of today's marked absences.
  Takes `availableClasses` and `canManage`.

### Rewritten

- `src/routes/_shared/absences/AbsencesEcoleView.tsx`  
  Declarations-only. Dropped marked feed merge, dropped
  `useSchoolMarkedAbsences` import, dropped class/matière filter row.
  Filter chips are now: À traiter (default) / Aujourd'hui / Toutes /
  Validées / Refusées.  
  Added a small info banner at top reinforcing the scope change so
  admin can't misread it: "Cette vue ne présente que les
  déclarations…"

- `src/routes/admin/tabs/archive/ArchiveAdminTab.tsx`  
  Rewritten as grouped (date → class → matière → élève). No more
  flat list, no more bulk selection. Per-row Supprimer preserved.

### Modified

- `src/routes/_shared/absences/VieScolaireTab.tsx`  
  Added 'appels' to ViewMode. New switcher layout with
  role-conditional buttons. Default mode for both roles is 'appels'.

## Firestore rules — no new ones needed

All surfaces use existing hooks with existing rules:
- `/presences/` collectionGroup (5d.5 rule)
- `/archived_absences/` (5d.6 rule)
- `/eleves/{}/absences/` collectionGroup (existing)

## What's NOT in this phase

- **Prof actions on marked entries** — currently `canManage=false` for
  profs so they can't delete marked absences from Appels du jour. If
  you want profs to be able to correct their OWN appel mistakes
  surgically (without re-taking), that's a targeted add: require
  `slot.pris_par_uid === user.uid` before showing the button. Defer
  until asked.
- **Prof Appels du jour notifications** — "3 kids absent from your
  Maths class today" on login. Would be nice but needs push infra.
- **Weekly summary per class** — "this week's matière with most
  absences" for admin. Defer.
- **CSV export of Appels du jour** — end-of-trimester reports.
  Phase 6 finances module will establish export patterns.
- **Prof-specific colored header on Appels du jour** — could
  highlight the matières taught by the viewing prof. Small polish.

## Testing priorities

1. **Admin lands on Appels du jour** — open Vie scolaire as admin, the
   default view should be Appels du jour (not Déclarations like
   before).

2. **Prof also sees Appels du jour** — log in as a prof, open Vie
   scolaire, default view is Appels du jour, scoped to their teaching
   classes.

3. **Admin switches to Déclarations** — all four mode buttons visible,
   tap Déclarations, flat list shows only self-declared (no marked).
   Info banner reads "Cette vue ne présente que les déclarations…".

4. **Prof doesn't see Déclarations or Archive** — log in as prof, only
   Appels du jour and Par classe buttons.

5. **Grouping correctness** — take appels in 2 different classes for 2
   different matières today. Open Appels du jour. Should see 2 class
   cards, each with the respective matières and counts.

6. **Expansion works** — click a matière row with N > 0 → élève list
   appears inline. Click row with N = 0 → nothing happens.

7. **Archive adopts grouped layout** — switch to Archive mode,
   yesterday's data (if any) shows grouped by date → class → matière.

8. **Delete in Appels du jour** (admin) — click trash on an élève row,
   confirm → row disappears AND the underlying /presences/ field is
   deleted.

9. **Admin lands on Appels, switches to Archive, comes back** — Appels
   du jour should reload with fresh data (no stale state).
