# Phase 5d.7 — Admin Archive browse UI

## What this phase ships

The browse surface for `/archived_absences/` — the collection that's
been accumulating since Phase 5d.6's daily rollover started running.
Admin can now look up any past marked absence by date range + class +
matière + élève name search, with bulk delete for end-of-year cleanup.

## Placement: Vie tab mode, not standalone tab

Added as the third mode in the existing `VieScolaireTab` segmented
control:

```
[ Triage école ]  [ Par classe ]  [ Archive ]
```

Why not a standalone admin tab:
- Adding an 8th tab to the admin nav gets dense (Classes/Élèves/Profs/
  Vie/Emploi/Annonces/Année already 7). Touch targets shrink.
- Mental model fit: the archive IS about school life / attendance. It
  lives under Vie scolaire because that's where admin goes to think
  about attendance.
- Grouping with Triage école + Par classe lets admin switch contexts
  quickly when reviewing a kid's situation: "what happened today? let
  me check last month too".

Admin-only — profs see the switcher without the Archive button (they
don't see canManage=true, and the mode only renders for admin).

## Date range philosophy

**Default: last 30 days.** Long enough to see "how's Marie been this
month", short enough to stay snappy for the Firestore query.

**Quick presets**: 7j / 30j / 90j / 1 an. Covers:
- 7j — "recent behavior check"
- 30j — "this month's pattern"
- 90j — "this trimester"
- 1 an — "full year review at end of school year"

Custom range via native `<input type="date">` fields with `min`/`max`
cross-constraints so users can't build an invalid range.

Date range is **mandatory** — the archive is unbounded, and loading
"everything ever" could balloon on a school that's been running for
years. 30 days default strikes the right balance.

## Query strategy

Client-side filtering on top of a server-side date range. Specifically:
- Firestore query: `where('date', '>=', from)` + `where('date', '<=', to)`
  + `orderBy('date', 'desc')`
- Class / matière / search filters applied in `useMemo` on the cached
  result

Why not server-side for all filters:
- Firestore composite indexes on `(classeId, date)` etc. would work
  but proliferate fast (one per filter combination)
- A 30-day range typically yields <200 docs for a CEG — trivially
  filterable in memory
- Admin-specific surface with batched reads anyway

## Bulk delete design

Checkbox per row. "Tout sélectionner / désélectionner" toggle in the
summary bar. "Supprimer {N}" button appears when selection is non-empty,
opens a danger-variant confirm with exact count.

**Selection auto-clears** when any filter (date/class/matière/search)
changes. Prevents the trap of selecting 50 rows, narrowing the filter
so only 3 are visible, then hitting "Supprimer 50" and nuking 47
invisible rows.

Firestore writes fire in parallel via `Promise.all` over individual
`deleteDoc` calls. For ≤50 deletes, this is fast and doesn't need a
batch. For >500 we'd switch to `writeBatch()`, but admin is unlikely
to select that many in one action.

## Empty state clarity

Three distinct emptiness scenarios, each with its own copy:
1. **No docs in range** — "Aucune archive dans la période. Élargissez
   la période ou vérifiez les appels précédents."
2. **Has docs but search/filters exclude everything** — "Aucune archive
   ne correspond aux filtres actuels."
3. **Genuinely empty (fresh school)** — same as #1 with softer tone.

## Files

### New

- `src/hooks/useArchivedAbsences.ts`  
  `useArchivedAbsences(range)` live snapshot. Takes `ArchiveRange` =
  `{from: Date, to: Date}`. Returns sorted `ArchivedAbsence[]`.

- `src/routes/admin/tabs/archive/ArchiveAdminTab.tsx`  
  The browse surface. Headerless (no `<Section>` wrapper) since parent
  `VieScolaireTab` provides the section chrome.

### Modified

- `src/hooks/useAbsenceManageMutations.ts`  
  Added `useDeleteArchivedAbsence(id)` and
  `useDeleteArchivedAbsencesBulk(ids[])`.

- `src/routes/_shared/absences/VieScolaireTab.tsx`  
  Added Archive as third mode. Button in the switcher, render case,
  dynamic description update.

## Firestore rules — reminder from 5d.6

This phase uses the same rule I called out for 5d.6:

```
match /archived_absences/{id} {
  allow read: if isStaff();
  allow create, update: if isStaff();  // for rollover
  allow delete: if isStaff();            // for this archive browse
}
```

If you haven't deployed it yet from 5d.6, deploy now or the archive
tab will show zero results.

## What's NOT in this phase

- **Export to CSV/PDF** — useful for end-of-year reports to parents or
  ministère. Defer until requested; Phase 6 finances module will
  establish export patterns we can reuse.
- **Grouping by élève** — "show me a kid's full absence history in
  one collapsible card". Easy to add later; for now admin uses search
  by élève name as a proxy.
- **Counts per matière / per class** summary at the top of the view.
  Could be useful for spotting patterns ("Marie has 8 absences in
  maths this trimester"). Defer until admin asks for it.
- **Per-élève drill-in from archive** — tap a row to see that élève's
  full archive. Would require a second query or client-side group.
  Defer.
- **Undo delete** — once deleted, archive entries are gone. No trash.
  End-of-year cleanup is the primary use case for delete, so undo
  isn't critical; a confirm dialog is the safety net.

## Testing priorities

**IMPORTANT**: apply the Firestore rule from 5d.6 first if not done.

1. **Archive mode visible for admin only** — log in as admin, Vie
   scolaire tab, see three mode buttons including Archive. Log in as
   a regular prof → no Archive button.

2. **Default 30-day range** — opens with date picker pre-populated to
   today and 30 days ago. Any archived data in that range should show.

3. **Preset buttons** — tap "7 j", range narrows. Tap "1 an", range
   widens. Manual date tweaks also work.

4. **Filters cascade** — pick a class, only that class's archive shows.
   Pick a matière, cascade narrows further. Switch class to one that
   doesn't have the current matière → matière clears automatically
   (same logic as Triage école).

5. **Search** — type a partial élève name, list narrows live.

6. **Bulk selection** — check two rows, summary bar shows "Tout
   désélectionner · Supprimer 2". Click "Supprimer 2" → confirm →
   both rows gone from view AND from Firestore.

7. **Selection clears on filter change** — select 5 rows, change the
   date range. Selection resets to 0. Good — this is the trap-
   prevention feature.

8. **Empty state** — clear date range to a date with no archive (e.g.
   future date) → "Aucune archive dans la période" empty state shows.

9. **Live update** — on device A (during rollover), on device B (admin
   browsing archive) — new archive entries appear without refresh.

10. **Mode persistence** — switch to Archive, switch to Triage école,
    switch back to Archive. The date range + filters should reset each
    time (this is the expected behavior — we don't persist across mode
    switches, keeping things stateless and predictable).
