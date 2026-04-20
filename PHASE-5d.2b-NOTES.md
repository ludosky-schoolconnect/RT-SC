# Phase 5d.2b — Vie scolaire (staff absence overview, Option C)

## What this phase ships

The staff-side surface of the absence module. Both inline (Mes-classes
drill-in) AND a dedicated cross-class tab. Same data, two access paths,
one underlying component.

## Architecture (Option C as agreed)

ONE shared component drives every surface:

```
AbsencesClasseView (per-class roster with collapsible per-élève timeline)
  ├─ inline → ModalAbsencesClasse (from any prof's "Mes classes" card)
  └─ tab    → VieScolaireTab (with class picker on top)
                ├─ Prof dashboard  · canManage=false · classes they teach
                └─ Admin dashboard · canManage=true  · all classes
```

### Read access
- **Any prof** sees absences for ANY student in classes they teach.
  Matches the legacy SC behavior — profs need this in-class to know
  "wait, why was Marie absent yesterday".
- **PP** is just a regular prof for read purposes; they get their own
  PP class as the default selection in the Vie scolaire tab as a small
  ergonomic touch.
- **Admin** sees every class.

### Write access (admin-only)
- **Valider** an absence in 'en attente' → statut = 'validée'
- **Refuser** an absence in 'en attente' → statut = 'refusée'
- **Supprimer** any declared absence (with confirm dialog)

The `canManage` prop on `AbsencesClasseView` toggles button rendering.
Profs never see the buttons. Firestore rules also enforce
`allow update, delete: if isStaff()` — but in practice we don't expose
the ability in the UI to non-admins.

## Unified read hook

`useEleveAbsencesUnified(classeId, eleveId, declared)` merges TWO storage
shapes:

1. **Self-declared** (from 5d.2a):
   `/classes/{classeId}/eleves/{eleveId}/absences/{auto}`
   → `kind: 'declared'` with `statut`, `raison`, `source`

2. **Prof-marked** (from 5d.1 appel):
   `/classes/{classeId}/presences/{YYYY-MM-DD}.{matiereSlug}.absents.{eleveId}`
   → `kind: 'marked'` with `matiereSlug`, `prisPar`, `heure`

Sorted chronologically (newest first). The `kind` discriminator lets the
UI render different visual treatments while sharing the timeline layout.

## Performance: lazy declared fetch

A class with 50 élèves × N declared absences each = a lot of listeners
if we eagerly fan out. So the design:

- `useClasseMarkedRollup(classeId)` — ONE listener on
  `/classes/{}/presences/`, used to compute per-élève marked counts.
  Drives the always-visible row summary ("3 marquées, dernière le 15
  oct"). No declared data needed for this.
- `useEleveAbsences(classeId, eleveId)` — only fires when a row is
  EXPANDED. Subscribes to that one élève's `/absences/` subcollection.
  Closing the row unmounts the listener.

So a class roll-up costs 1 Firestore listener + N short-lived listeners
(one per row the user expands). Cheap.

## Unified vs split storage rationale (recap)

Why we didn't migrate everything to a single collection:

- Per-day-per-matière (`/presences`) is the natural shape for taking
  attendance. One save per appel = one Firestore write.
- Per-élève (`/absences`) is the natural shape for declarations. One
  document per event, lifecycle independent of class structure.
- Migrating either to the other forces N writes per logical operation.

Complexity stays at the read layer where a unified view is needed. Read
operations are cheaper than writes, so this is the right trade-off.

## Files

### New

- `src/hooks/useClasseAbsences.ts`  
  `useClasseMarkedRollup(classeId)` for the per-élève summary;
  `useEleveAbsencesUnified(classeId, eleveId, declared)` for the
  per-élève merged timeline. `UnifiedAbsence` type with `kind`
  discriminator.

- `src/hooks/useAbsenceManageMutations.ts`  
  `useUpdateAbsenceStatut` (validée/refusée) + `useDeleteAbsence`.
  Statut writes include `statutUpdatedAt` server timestamp for audit.

- `src/routes/_shared/absences/AbsencesClasseView.tsx`  
  Per-class collapsible roster. Summary strip at top. Sorted by recency
  of marked absence, then alpha. Lazy declared-fetch on row expand.
  Admin actions render only when `canManage=true`.

- `src/routes/_shared/absences/VieScolaireTab.tsx`  
  Wrapper with class picker. `availableClasses[]` + `defaultClasseId?`
  + `canManage`. Self-corrects selection if user loses access mid-session.

- `src/routes/_shared/absences/ModalAbsencesClasse.tsx`  
  Inline drill-in modal. Renders the same `AbsencesClasseView` in a
  large modal triggered from any prof class card.

### Modified

- `src/routes/prof/tabs/classes/MesClassesTab.tsx`  
  Added "Absences" trigger on the classe card next to Codes/Notes.
  Truncated existing labels ("Codes d'accès" → "Codes", "Saisir des
  notes" → "Notes") to fit three actions. Wires `ModalAbsencesClasse`.

- `src/routes/prof/ProfDashboard.tsx`  
  Added Vie scolaire tab between Appel and Emploi. PP gets their PP
  class as the default selection. `canManage=false`.

- `src/routes/admin/AdminDashboard.tsx`  
  Added Vie scolaire tab between Profs and Emploi. School-wide.
  `canManage=true`.

## Firestore rules — already covered

Your existing absences subcollection rule:
```
allow read: if isStudentOf(...) || isParentOf(...) || isStaff();
allow create: if (eleve/parent + time window) || isStaff();
allow update, delete: if isStaff();
```

5d.2b reads via `isStaff()` — already permitted. Admin writes
(approve/refuse/delete) via `allow update, delete: if isStaff()` —
already permitted. UI-level admin gating is the only restriction
(`canManage=false` for profs).

For `/classes/{}/presences/{}` reads needed by the unified view: the
existing rule `allow read: if true` from 5d.1 covers it.

## What's NOT in this phase

- **Per-day school-wide overview** (admin "today's absentees across all
  classes") — useful for admin but distinct surface; defer until asked.
- **Filters** — date range, statut, source. Easy to add later if the
  per-class lists get long.
- **Export to CSV / PDF** — admin will want this eventually for the
  monthly report; defer until requested.
- **Notification on approval/refusal** — the élève/parent currently
  doesn't get pinged when their declaration's status flips. Their tab
  shows it next time they look. Add push later if needed.
- **Conflict detection** between declared and marked — e.g. élève
  declared "absent for a medical appointment 8h-10h" but a prof marked
  them present at 9h. Currently shown as two separate timeline entries;
  a future "conflicts" filter could surface them.

## Testing priorities

1. **Prof inline drill-in** — log in as prof, tap "Absences" on a class
   card → modal opens with that class's roster. Tap an élève → expand,
   see merged timeline. Confirm NO admin action buttons appear.

2. **Prof Vie scolaire tab** — open the tab, class picker shows ONLY
   classes the prof teaches. PP sees their PP class pre-selected.

3. **Admin Vie scolaire** — class picker shows ALL classes. Admin
   actions visible: Valider/Refuser on "en attente" rows, Supprimer
   trash icon on every declared row.

4. **Admin Valider** — tap on an "en attente" declaration, confirm
   toast. Statut badge flips to green "Validée" instantly via
   onSnapshot. Verify élève's "Mes absences" tab also shows the new
   statut.

5. **Admin Refuser** — same flow, badge flips to red "Refusée".

6. **Admin Supprimer** — confirm dialog danger variant. Confirm →
   row disappears from the list. Élève's "Mes absences" no longer
   shows it.

7. **Marked absence display** — take an appel marking a student absent
   in a matière (5d.1). Open Vie scolaire → that student's row
   shows `markedCount: 1`. Expand → the marked entry appears in the
   timeline with the prof's name and matière.

8. **Lazy declared fetch** — open Vie scolaire, do NOT expand any
   row. Open Network tab in browser → only `/presences/` listener
   should be active for the class. Expand a row → a new listener for
   that élève's `/absences/` should appear.

9. **Multi-class prof selection** — switch class picker, the
   AbsencesClasseView should remount with new data without flicker.
