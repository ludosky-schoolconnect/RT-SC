# Phase 5d.2c — Admin école-wide absences triage

## What this phase ships

Fixes the UX flaw I introduced in 5d.2b. The previous design forced
admin to scroll into each class to validate or refuse declarations
— bad triage UX for a school with 20+ classes and 50+ pending requests.

The legacy SchoolConnect did this correctly: one flat school-wide
table sorted by date desc, with one-tap Valider/Refuser actions and
a search bar. This phase brings that pattern back, properly.

## What changed

### `VieScolaireTab` now has TWO modes

Switchable via segmented control (admin only — profs always see
per-class):

1. **Triage école** (admin default)  
   Flat list of all declared absences across the school. Filterable by
   statut chips (À traiter / Toutes / Validées / Refusées). Search bar
   for élève / classe / motif. One-tap action buttons per row.

2. **Par classe** (prof default, admin secondary)  
   The Option C view from 5d.2b — class picker + collapsible per-élève
   timeline merging declared + appel-marked absences.

Profs only ever see the per-class mode; the switcher doesn't render
for them. Admin lands on Triage école because that's the high-frequency
workflow; switching to Par classe takes them to the contextual deep
dive when needed.

### `AbsencesEcoleView` (new)

The flat triage table. Cards (mobile-friendly) sorted newest first with:
- Élève name + classe label + raison
- Statut badge (En attente / Validée / Refusée)
- Date pill + time range + source attribution (Élève / Parent / Prof)
- Action row:
  - **En attente** → Valider (primary green) + Refuser (secondary)
  - **All declared** → Supprimer (danger trash, with confirm)

### Filter chips with live counters

Four chips at the top, each showing the count of matching absences:
```
À traiter [3]   Toutes [47]   Validées [38]   Refusées [6]
```
Counts are computed on the unfiltered set so they don't change when a
filter is applied — admin always knows how many pending items remain.

### Search

Auto-shown when there are >5 absences. Searches across élève name,
classe label, and raison string. Plain substring match.

### `useSchoolAbsences` (new hook)

Uses Firestore's **collectionGroup('absences')** to fetch every declared
absence in the school in ONE listener. Cheap, scalable. Document path
is parsed to extract `classeId` + `eleveId` for write-back operations.

Returns `SchoolAbsence[]` = `Absence` enriched with parent path info.

## Performance

One Firestore listener total for the entire admin triage view, regardless
of school size. Filtering and search happen client-side on the cached
list — instant.

For a typical CEG school (20 classes × 50 élèves × maybe 1 declaration
per élève per month = ~500 docs at the high end), this fits trivially
in memory and renders fast.

## Firestore rule — already covered

Your existing collectionGroup rule:
```
match /{path=**}/absences/{absenceId} {
  allow read: if isStaff();
}
```

Covers `useSchoolAbsences`. The `=**` wildcard matches the deep nested
paths of subcollections. No new rules needed.

## Files

### New

- `src/hooks/useSchoolAbsences.ts`  
  School-wide collectionGroup listener. Returns `SchoolAbsence[]`
  enriched with classeId + eleveId from the path.

- `src/routes/_shared/absences/AbsencesEcoleView.tsx`  
  Flat triage view. Filter chips + search + cards with action buttons.

### Modified

- `src/routes/_shared/absences/VieScolaireTab.tsx`  
  Added view-mode segmented control (Triage école / Par classe). Admin
  defaults to Triage école; profs always see Par classe (switcher
  hidden).

## Files NOT modified

- Admin / Prof dashboard wiring stays the same — `VieScolaireTab` is
  drop-in compatible. The switcher is internal to the tab.
- `AbsencesClasseView` unchanged — still the per-class deep-dive used by
  inline drill-in and "Par classe" mode.
- All admin write hooks (`useUpdateAbsenceStatut`, `useDeleteAbsence`)
  shared between both views.

## Testing priorities

1. **Admin lands on Triage école** — open Vie scolaire as admin, the
   default view should be the flat school-wide list, not the per-class
   picker.

2. **Admin sees mode switcher** — segmented control "Triage école /
   Par classe" visible at the top.

3. **Prof does NOT see switcher** — log in as a prof, open Vie scolaire,
   only the class picker appears (no segmented control).

4. **Filter chips count correctly** — counts shown in chips match the
   total of each statut across the school.

5. **À traiter is the default** — admin lands on the "À traiter" filter
   so they immediately see only pending items.

6. **One-tap Valider** — click Valider on a pending row, the row's
   statut badge flips and the chip counters update (À traiter -1,
   Validées +1).

7. **Search across fields** — type a partial élève name or classe
   label, list narrows correctly.

8. **Admin switches to Par classe** — click "Par classe", classe
   picker appears, can drill into one class with the existing
   collapsible per-élève view.

9. **Live updates** — on device A (parent) declare an absence; on
   device B (admin) the new row should appear in Triage école
   instantly via the collectionGroup listener.
