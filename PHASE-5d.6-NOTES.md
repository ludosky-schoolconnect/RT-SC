# Phase 5d.6 — Daily archive roll-over + class/matière filters

## What this phase ships

Two related changes that together fix the "active triage drowns in
yesterday's data" problem you flagged:

1. **Daily archive roll-over**: appel-marked absences from past days
   are moved out of `/presences/` into a new `/archived_absences/`
   collection, leaving the active Triage école showing only today's
   marked entries.

2. **Class + matière filters** on the Triage école for fast lookups
   like "show me all 3ème M1 absences in Maths today".

## The lifecycle distinction

You codified this clearly:

| Kind | Active for | Then |
|------|-----------|------|
| **Marked** (appel) | Today only | Auto-archived next day with full detail |
| **Declared** (élève/parent) | Until reviewed or 14 days, whichever first | Gone forever, no archive |

The two kinds genuinely have different roles:

- **Marked** = facts. They never go stale. Admin needs them later for
  discipline decisions, end-of-trimester behavior reviews, parent
  meetings. The archive is the historical record.

- **Declared** = proposals. They expire because they're requests
  awaiting action. If admin hasn't acted in 14 days, the request is
  effectively dead and clutter; if admin has acted (validée/refusée),
  they don't need to resurface. Either way, no value in archiving.

## Archive collection design

```
/archived_absences/{auto}
  ├─ id: deterministic composite "${classeId}__${dateISO}__${matiereSlug}__${eleveId}"
  ├─ classeId, eleveId
  ├─ classeNom, eleveNom (denormalized)
  ├─ dateISO: "YYYY-MM-DD"
  ├─ date: Timestamp (for orderBy queries)
  ├─ matiereSlug, matiere (humanized)
  ├─ heure: "HH:MM" (when prof saved during appel)
  ├─ raison?: string (the prof's note or null)
  ├─ prisPar: string (prof name)
  ├─ prisParUid?: string
  └─ archivedAt: Timestamp (when the rollover wrote this row)
```

**Top-level flat collection** (not nested under classes) — simpler
cross-class queries for the future Archive tab. The composite ID
makes the rollover idempotent: re-running it for the same source
data produces the same archive doc IDs, so concurrent admin sessions
opening Triage école at the same moment can't create duplicates.

## Roll-over mechanism

`useArchiveRollover()` runs ONCE per session (module-scoped flag),
mounted at the top of `AbsencesEcoleView`. Logic:

1. `getDocs(collectionGroup('presences'))` — one-shot read of every
   presence doc in the school.
2. For each doc, check `dateISO < today`. Skip if today or future.
3. For each old doc:
   - Walk every matière slot's `absents` map
   - For each (élève, matière) pair, write
     `setDoc(/archived_absences/{compositeId}, {...denormalized})`
   - Delete the original `/classes/{classeId}/presences/{dateISO}` doc
4. The active triage view's `onSnapshot` listener re-fires with the
   deletions and the active list naturally clears yesterday's entries.

**Why lazy-on-read instead of cron:**
- Same trade-off as the 14-day declaration cleanup
- No infrastructure dependency (no Cloud Functions setup)
- Runs naturally during admin's daily workflow
- If admin doesn't open the app for 3 days, archive runs on day 4's
  first open — late but still correct
- For a single-school CEG with a daily-active admin, this is fine

**Failure handling:** errors are warnings. Worst case the active
view briefly shows yesterday's data alongside today's — annoying but
not data-loss. We retry on the next session.

## Active-view cutoff

The pre-today filter is applied in **three places** so consistency
is guaranteed regardless of which surface the user opens:

- `useSchoolMarkedAbsences` — Triage école's marked feed
- `useClasseMarkedRollup` — per-class summary counts
- `useEleveAbsencesUnified` — per-élève expanded timeline

Even if the rollover hasn't run yet (e.g. admin browsing immediately
after a deploy), pre-today entries are still excluded from active
views. The rollover is what physically deletes them; the read
filter is what visually hides them.

## Filter row design

When the chip filter is in scope for marked entries (Aujourd'hui /
Toutes / Marquées), a second filter row appears:

```
[ Toutes les classes ▾ ]   [ Toutes les matières ▾ ]   [ Effacer ]
```

- **Classe dropdown**: shows only classes that actually have a marked
  entry in the current data (avoids cluttering with empty classes)
- **Matière dropdown**: shows only matières present in the current
  data, optionally narrowed by the selected class
- Cascading reset: changing class to one without the currently-selected
  matière auto-clears matière (avoids stale "no results" empty state)
- **Effacer** button only renders when at least one filter is active

Hidden for "À traiter" and "Déclarées" filters since those views
contain no marked entries to filter.

**Filters apply only to marked entries.** Declared entries always
pass through, because:
- Declarations don't have a matière (they're full-day events)
- Declarations don't have a classe-typed signal beyond being attached
  to one — admin can use search if they need to scope by class for
  declarations

## Files

### New

- `src/hooks/useArchiveRollover.ts`  
  Session-flag-guarded rollover. One-shot getDocs + per-doc
  setDoc/deleteDoc. Idempotent via composite IDs.

### Modified

- `src/types/models.ts`  
  Added `ArchivedAbsence` interface.

- `src/lib/firestore-keys.ts`  
  Added `archivedAbsencesCol()` and `archivedAbsenceDoc(id)`.

- `src/hooks/useSchoolMarkedAbsences.ts`  
  `dateISO < today` filter inside snapshot callback.

- `src/hooks/useClasseAbsences.ts`  
  Same filter applied to both `useClasseMarkedRollup` and
  `useEleveAbsencesUnified`.

- `src/routes/_shared/absences/AbsencesEcoleView.tsx`  
  Calls `useArchiveRollover()` at top of function. New `classeFilter`
  and `matiereFilter` state with cascading-reset effect. Filter row
  conditionally rendered. Filter logic in `filtered` memo applies to
  marked entries only.

## Firestore rules — IMPORTANT

You need to add a rule for the new archive collection. Add this:

```
match /archived_absences/{id} {
  allow read: if isStaff();
  allow create, update: if isStaff();
  allow delete: if isStaff();
}
```

Without this:
- The rollover will fail silently (writes blocked) → past data stays
  in `/presences/` and is filtered out of view but never archived.
- The future Archive tab won't be able to read anything.

Deploy with `firebase deploy --only firestore:rules` after editing.

## What's NOT in this phase

- **Archive browse UI** — the actual "Archive" tab where admin
  searches the historical record. Stub for next phase. Data is
  being collected from now on.
- **Archive cleanup policy** — archived docs accumulate forever
  until manually deleted. End of school year cleanup or admin-
  triggered "delete all before X" coming later.
- **Counter telemetry** — we log archived/deleted counts to console
  but don't surface them to UI. Could add a one-time "Archived 47
  past absences" toast on rollover for transparency.
- **Rollover from prof account** — only admin triggers it. If admin
  doesn't log in for a week, prof Vie scolaire sees today only
  (correct) but the cleanup itself is delayed (acceptable —
  Firestore doesn't slow down meaningfully from a few extra docs).

## Testing priorities

**IMPORTANT — apply the rule first**, otherwise rollover fails
silently and tests look broken.

1. **Today's marked still visible** — take an appel marking Marie
   absent → admin opens Vie scolaire → Triage école → "Aujourd'hui"
   filter (default) → Marie's marked absence is in the list.

2. **Yesterday's marked auto-archives** — set device clock back one
   day, take an appel marking Pierre absent. Set clock forward to
   today. Admin opens Vie scolaire (triggers rollover) → Pierre's
   absence should NO LONGER appear in the active view → check
   Firestore console: `/archived_absences/` should contain a doc
   with composite ID, full Pierre data preserved.

3. **Idempotent rollover** — open Triage école, close, reopen. The
   archive collection should NOT have duplicate Pierre entries
   (composite ID guards against this).

4. **Class filter** — admin Triage école → click class dropdown,
   select a class → only marked entries from that class show.
   Declared entries (if any) still appear.

5. **Matière filter cascades** — select a class, then matière. Both
   apply. Switch class to one without that matière — matière
   automatically clears.

6. **Effacer button** — appears when any filter active, clears both,
   returns to "Toutes / Toutes".

7. **Filter hidden on declaration views** — switch chip to
   "À traiter" or "Déclarées" → class/matière dropdowns disappear.

8. **Per-class view also cuts off pre-today** — open "Par classe"
   tab, expand an élève who had marked absences yesterday. The
   timeline shows only today's marked + ALL declared (declarations
   span 14 days).
