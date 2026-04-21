# Phase 5d.5 — Admin Triage école shows marked absences too

## What this phase ships

Fixes the conceptual flaw in 5d.2c: appel-marked absences (the most
common kind) were invisible in the admin's default Vie scolaire view.

The mental model you had is now matched by the architecture:
- **Marked by prof** = facts admin needs to see (kid skipped class)
- **Declared by élève/parent** = proposals admin needs to review
- Both deserve to be in the same place, sorted by recency

## The problem with the previous design

5d.2c assumed admin's job was reviewing declarations:
- `useSchoolAbsences` only read /eleves/{}/absences/ (declarations)
- Filter chips were À traiter / Toutes / Validées / Refusées (review-centric)
- Marked absences were buried in "Par classe" mode, requiring drill-in
  per class

But for a Béninois CEG, the typical day is:
- 5–10 students marked absent during appels (real attendance facts)
- 0–2 declarations per week (occasional medical / family events)

So the high-frequency stream was the one nobody could see. That's
backwards.

## New design

**`AbsencesEcoleView` merges both sources** chronologically with
`kind: 'declared' | 'marked'` discriminator. Each entry renders with
the appropriate UI:

| Entry kind                   | Badge      | Actions                       |
|------------------------------|------------|-------------------------------|
| Marked (from appel)          | "Marquée"  | Supprimer                     |
| Declared en attente          | En attente | Valider, Refuser, Supprimer   |
| Declared validée / refusée   | Validée/R  | Supprimer                     |

**Filter chips reframed around time + source**:
- **Aujourd'hui** (default) — most useful for daily monitoring
- **À traiter** — only declarations in 'en attente'
- **Toutes** — everything ever
- **Marquées** — only appel-marked
- **Déclarées** — only declarations

Each chip shows a live count.

## Why "supprimer" exists for marked absences

Admin error correction. If a prof marks Marie absent by mistake and
notices later (or Marie's parent calls in), forcing the prof to re-take
the entire appel just to fix one row is friction. Admin can surgically
delete one entry with `useDeleteMarkedAbsence` which uses Firestore's
`FieldValue.delete()` on the nested path
`{matiereSlug}.absents.{eleveId}` — surgical, doesn't touch other
slots or other students.

This is an admin-only escape hatch. Prof workflow is still: re-take
the appel via the Appel tab, which fully replaces the slot.

## Files

### New

- `src/hooks/useSchoolMarkedAbsences.ts`  
  collectionGroup('presences') listener. Parses each per-day-per-matière
  slot, emits one `SchoolMarkedAbsence` per (élève, matière, date) where
  the élève appears in `slot.absents`. Returns the flat list sorted
  newest first.

### Modified

- `src/hooks/useAbsenceManageMutations.ts`  
  Added `useDeleteMarkedAbsence({classeId, dateISO, matiereSlug, eleveId})`.
  Uses `updateDoc` with `deleteField()` on the nested key. Surgical —
  doesn't touch other slots or other absent students.

- `src/routes/_shared/absences/AbsencesEcoleView.tsx`  
  Full rewrite. Merges declared + marked into one chronological list.
  New filter chips (Aujourd'hui / À traiter / Toutes / Marquées /
  Déclarées). Each entry carries `kind` and renders the appropriate
  badge + action set.

## Firestore rule — IMPORTANT

For collectionGroup queries on /presences/ to work, you need a top-level
collectionGroup rule. Add this to your rules file:

```
match /{path=**}/presences/{date} {
  allow read: if isStaff();
}
```

This is the same pattern as your existing absences rule. Without it,
`useSchoolMarkedAbsences` will silently return zero results because
the collectionGroup query gets denied at the rules layer (not at the
listener level).

Your existing per-class presence rule (`/classes/{classeId}/presences/{date}`
inside the classes match) handles direct-path reads but does NOT cover
collectionGroup queries — they need their own rule via the `=**`
wildcard.

If after applying this patch admin still sees zero marked absences in
Triage école, the rule is the cause. Check the Firestore console →
Rules → make sure the collectionGroup-style rule is present and
deployed.

## What's NOT in this phase

- **Per-row "see in context" link** — would be nice to tap a row and
  jump to that class's per-classe view. Defer until asked.
- **Group by élève** — currently sorted by date. For "who's absent a
  lot" analysis the user could switch to "Par classe" mode and
  expand a row. A school-wide grouped view could come later.
- **Cross-source dedup** — if a kid declared "absent today" AND a prof
  marked them absent during appel, both entries show up. That's
  correct behavior (they're different facts), but a small "this matches
  a declaration" badge could be added later.
- **Date range filter** — only "Aujourd'hui" exists as a time filter.
  A "Cette semaine" or custom date picker could come later.

## Testing priorities

1. **Apply the rule first** — `match /{path=**}/presences/{date}` etc.,
   deploy, THEN test. Otherwise you'll see empty results and think the
   patch is broken.

2. **Today's appel shows up immediately** — take an appel marking
   Marie absent → admin opens Vie scolaire → Triage école default
   "Aujourd'hui" → Marie's marked absence is in the list with
   "Marquée" badge.

3. **Counters are accurate** — Aujourd'hui chip shows the count of
   today's events (declared + marked). Marquées chip shows total
   marked. Etc.

4. **Filter switching** — tap "Marquées" → only marked entries show.
   Tap "Déclarées" → only declarations. Tap "À traiter" → only
   pending declarations (no marked entries because they don't have
   a status).

5. **Delete a marked absence** — tap trash on a marked entry,
   confirm dialog reads "L'absence marquée pour Marie en
   mathematiques (mer. 21 avr.) sera supprimée définitivement."
   Confirm → entry disappears AND the underlying
   /presences/{date}.{matiere}.absents.{eleveId} field is gone in
   Firestore.

6. **Prof re-take after admin delete** — admin deletes Marie's
   marked absence. Prof reopens the appel. Marie is back to "Présent"
   default (no longer in absents map). Prof can re-mark her if needed.

7. **Live updates** — on device A take an appel; on device B
   (admin) the new marked absence appears in Triage école
   immediately.
