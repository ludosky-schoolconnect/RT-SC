# Phase 5d.2a — Absences: élève + parent declaration

## What this phase ships

The consumer-facing side of the absence module. Élève and parent can:

- Declare an absence in advance
- See their full history with statut (En attente / Validée / Refusée)

PP/admin overview + approve/refuse actions ship in the next phase
(5d.2b).

## Key design decisions

### Two storage shapes for one human concept

Self-declared absences live in `/classes/{}/eleves/{}/absences/{auto}`.
Prof-marked absences (from 5d.1 appel) live in
`/classes/{}/presences/{date}.{matiereSlug}.absents{}`.

Why split:
- **Per-day-per-matière** is the natural shape for taking attendance
  (one prof, one matière, one save). Migrating it to per-élève would
  force one Firestore write per absent student instead of one batched
  write per appel — much slower, higher cost.
- **Per-élève** is the natural shape for declarations (one event,
  belongs to one élève, may span multiple slots).

The complexity stays at the read layer when needed. 5d.2b's PP overview
will merge both for a unified per-élève timeline; for now, the élève
"Mes absences" tab shows only self-declared events (matches legacy SC
behavior).

### Declaration permission model

- Élève or parent can declare for themselves / their child
- Statut starts as `'en attente'`
- PP/admin can later flip to `'validée'` or `'refusée'` (5d.2b)
- If never reviewed, stays `'en attente'` indefinitely (school decides
  whether they care about approval workflow)

### Time-locks (server-authoritative)

The legacy used a HEAD request to fetch server time and compared
client-side. Clever but adds latency and one extra round trip per save.

RT-SC uses **Firestore Security Rules** instead:
```
allow create: if isStaff() ||
  ((isStudentOf(...) || isParentOf(...))
    && request.time.hours() >= 5 && request.time.hours() < 17);
```

`request.time` is the server's clock — can't be tampered with by
changing the device clock. The 5h–17h UTC window = 6h–18h Bénin local
(WAT, UTC+1, no DST). Already in your existing rules file from earlier
work; nothing to add for 5d.2a.

If a user tries to declare outside the window, the modal catches the
`PERMISSION_DENIED` error and surfaces a friendly message:
> "Action refusée : les déclarations sont possibles uniquement entre
>  06h et 18h."

### Anti-spam quotas (client-side)

Two quotas enforced in the modal before save:

1. **Same-day**: max 1 declaration for the same date.
2. **Same-week**: max 3 declarations created in the current Mon–Sat
   week.

These are advisory — they live in `checkQuota()` in
`useEleveAbsencesMutations.ts`, called before the mutation. A user
who bypasses the client could still hit the rules, which don't
enforce these (rules don't easily count documents).

If quotas become a real abuse vector, we can move them to a Cloud
Function trigger. For now client-side is enough for honest users.

### Validation rules in the form

- **Date**: required, must be today or future (no back-dating). The
  `<input type="date" min={today}>` enforces visually + the
  validate() function double-checks.
- **Time range**: both required; `heureDebut < heureFin`.
- **Raison**: minimum 10 characters. Catches "malade", "rdv" etc.
  forces actual context.
- **Quota**: see above.

### Source attribution

Every declaration carries `source: 'eleve' | 'parent'` so the PP can
see who logged it. Future audit log / dispute resolution. Plus
`declaredByUid` (Firebase UID at time of save) for traceability.

The display shows a sourceTag on each row:
- `parent` → "Déclarée par parent"
- `eleve` → "Auto-déclarée"
- `appel_prof` → "Marquée par prof" (will only appear once 5d.2b's
  unified timeline merges both sources)

## Files

### New

- `src/hooks/useEleveAbsences.ts`  
  `useEleveAbsences(classeId, eleveId)` — live snapshot of one élève's
  declared absences, sorted newest first.

- `src/hooks/useEleveAbsencesMutations.ts`  
  `useDeclareAbsence(input)` — single-doc create. Plus `checkQuota()`
  pure helper for client-side quota enforcement.

- `src/routes/_shared/absences/ModalDeclareAbsence.tsx`  
  Form with date / time range / raison. Mode-aware copy (élève vs
  parent framing). Surfaces friendly errors for permission-denied
  (rule-blocked time windows) and quota exceeded.

- `src/routes/_shared/absences/AbsencesTab.tsx`  
  Shared "Mes absences" tab. Cards with statut badges + source tags +
  raison. "Déclarer" button at top (and in empty state).

### Modified

- `src/types/models.ts`  
  Added `'parent'` to `SourceAbsence` union.

- `src/routes/eleve/EleveDashboard.tsx`  
  Replaced `Plus` placeholder tab with real `Absences` tab. Tab order:
  Accueil → Bulletins → Emploi → Absences. Dropped `MoreHorizontal` /
  `Construction` / `PlusPlaceholder` since they're no longer needed.

- `src/routes/parent/ParentApp.tsx`  
  Added `Absences` tab between Emploi and Plus. Wired with
  `ChildSwitcherStrip` like other parent tabs so multi-child parents
  can swap kids without leaving. Plus tab kept (it's the
  child-management surface, not a placeholder).

## Firestore rules — already covered

Your existing rule for the absences subcollection enforces both staff
and élève/parent-with-time-window paths:

```
match /absences/{document=**} { 
  allow read: if isStudentOf(classeId, eleveId) || isParentOf(classeId, eleveId) || isStaff(); 
  
  allow create: if isStaff() || 
    ((isStudentOf(classeId, eleveId) || isParentOf(classeId, eleveId)) 
      && request.time.hours() >= 5 && request.time.hours() < 17);
              
  allow update, delete: if isStaff(); 
}
```

5d.2a writes through the create path. **No new rules needed.**

5d.2b's PP/admin approve/refuse actions will use the existing `update if
isStaff()` clause.

## What's NOT in this phase

- **PP/admin overview tab** — Phase 5d.2b. Cross-class roll-up,
  filterable list, approve/refuse buttons.
- **Unified timeline** merging declared + appel-marked absences —
  5d.2b read layer.
- **Verrou-appel** (block self-declaration when prof has marked you
  absent today) — deferred. Rare use case, and the temporal logic
  conflicts with the 06h–18h window anyway.
- **Notification to parents on prof-marked absence** — far future
  (push or SMS, separate decision).
- **Justification document upload** (PDF/photo of medical certificate)
  — useful but adds Storage costs + quotas; defer until requested.
- **Parent dispute resolution** — can flag a "validée" or "refusée"
  declaration for review. Out of scope.

## Testing priorities

1. **Élève declaration happy path** — log in as élève, Absences tab,
   "Déclarer", fill form (today's date, 08h–17h, raison ≥10 chars),
   Déclarer. Toast → row appears in history with "En attente" badge.

2. **Parent declaration** — log in as parent (multi-child), pick a
   child, declare → row appears with source tag "Déclarée par parent".

3. **Past date blocked** — open form, try to set date earlier than
   today → date input rejects via `min` attribute, validate() catches
   any bypass.

4. **Time range validation** — set heureFin earlier than heureDebut →
   inline error.

5. **Raison too short** — type "malade" (6 chars) → error
   "10 caractères minimum".

6. **Same-day quota** — declare an absence for tomorrow, then try a
   second one for the SAME tomorrow → error "Vous avez déjà déclaré
   une absence pour ce jour."

7. **Off-hours block** — set device clock to 19h Bénin time, try to
   declare → permission denied at rules layer → friendly error
   "uniquement entre 06h et 18h".

8. **Live snapshot** — on device A declare an absence; on device B
   (parent of same kid) the row should appear instantly in the
   parent's Absences tab.

9. **Multi-child parent** — declare for Child A, swap to Child B,
   verify Child A's declaration doesn't appear in Child B's history.
