# Phase 5d.1 — Appel (roll call): prof side

## What this phase ships

The full prof-side roll-call workflow. A new "Appel" tab in the prof
dashboard with smart entry from the schedule, a 3-state per-student picker
(Présent / Retard / Absent), and one-tap save into a per-day, per-matière
presence document.

## Why this is the killer feature

Until now, prof workflow was: open phone, navigate to dashboard, find
their class in the list, find the matière, find today's date, **then**
take attendance. Five+ taps before the actual work.

With 5c (emploi) shipped, we know what's running right now. So the Appel
tab can lead with a single big card:

```
┌────────────────────────────────────────────┐
│  ●EN COURS                                 │
│  Mathématiques                             │
│  6ème A · 08:00–10:00 · Salle M1           │
│                                            │
│  [  ✓ Faire l'appel  ]                     │
└────────────────────────────────────────────┘
```

Two taps from app launch to taking the class roll. That's the bar.

## The 3-state model

**Legacy** had only 2 states (Présent / Absent). Real classrooms have
three: a kid who showed up at 08:15 for an 08:00 class isn't "absent" —
they're a retard (late). Marking them absent skews everything: parents
get a false alarm, the kid is dinged on attendance stats, and nobody
catches the lateness pattern.

**RT-SC** model:
- **Présent** (green ✓) — default for everyone
- **Retard** (amber clock) — showed up late
- **Absent** (red ✗) — didn't show up

The default-Présent UX matches reality: in a 50-student CEG class, the
prof typically only flips 2-5 students. Forcing them to flip everyone
to Présent first would be hostile.

## Data model

```
/classes/{classeId}/presences/{YYYY-MM-DD}
  ├─ {matiereSlug}:               ← one slot per matière taken that day
  │    ├─ absents:                ← {[eleveId]: AbsentMark}
  │    │    └─ {nom, heure, raison?}
  │    ├─ retards:                ← {[eleveId]: RetardMark}
  │    │    └─ {nom, heure, minutes?}
  │    ├─ pris_par: "M. Adjovi"   ← denormalized prof name
  │    ├─ pris_par_uid: "abc123"  ← prof firebase UID
  │    ├─ pris_a: <Timestamp>     ← server timestamp
  │    ├─ total_eleves: 47        ← snapshot count for stats
  │    └─ seanceId?: "xyz789"     ← optional ref to /seances/{id}
  ├─ {matiereSlug2}: ...          ← one prof's English class
  └─ ...
```

**One write per appel** via `setDoc({ [slug]: slot }, { merge: true })`.
Idempotent — re-saving overwrites the slot. Other matières taken the
same day stay untouched.

**Per-matière granularity** matters because in CEG, a kid can be present
for math (8h) and absent for français (10h) — same day, different slots.
Storing one "absent today: yes/no" would lose this.

## Smart entry from emploi

The Appel tab's lobby has three sections:

1. **HERO — En cours** (green pulsing): every séance currently running
   for this prof. The 95% case. One tap → loaded appel screen.

2. **Prochain cours**: when nothing is live but something's coming today.
   "Préparer l'appel" button lets prof start early (handy for those who
   like to set up before students enter).

3. **Plus tôt aujourd'hui**: chronological list of today's already-passed
   séances. Catch-up taking — useful for profs who forgot mid-day.

4. **Manual fallback**: classe + matière dropdown for any catch-up that
   doesn't fit the smart entries above (e.g. taking yesterday's appel
   today, or a substitute teacher).

## Re-take semantics

If a slot has already been saved (`pris_par` exists), the appel screen:

- Hydrates the existing marks (so the prof sees what was saved before)
- Shows a "Déjà pris par X. Vous pouvez amender — l'enregistrement
  remplacera l'ancien." banner
- The save button label flips from "Enregistrer l'appel" to "Mettre à jour"

No conflict UI, no merge logic. Last-write-wins is fine for this surface
because:
- It's always staff-written, no random-user edits
- Same prof correcting their own appel = simple replace
- Different prof for the same matière = exceedingly rare; if it happens,
  the second prof saw the first's marks before saving anyway

## Confirm guard: "everyone present?"

If the prof saves with zero absents AND zero retards, we show a confirm:

> "Tous les élèves sont présents ? Aucun élève n'a été marqué absent ou
> en retard. Confirmez-vous que toute la classe est là ?"

Catches the common mistake of opening the appel screen and immediately
hitting Save without scrolling through the list.

## Files

### New

- `src/hooks/usePresence.ts`  
  `usePresenceDoc(classeId, dateISO)` — live snapshot of a day's presence
  doc. Returns `null` if nothing taken yet for that date.

- `src/hooks/usePresenceMutations.ts`  
  `useSaveAppel(SaveAppelInput)` — single-call mutation that writes the
  slot. Plus exported helpers `todayISO()`, `nowHHMM()`.

- `src/routes/prof/tabs/appel/AppelScreen.tsx`  
  Full-screen takeover (own header with back button). Stats strip with
  Présents/Retards/Absents pills. "Déjà soumis" banner. Auto-shown
  search bar for classes >8 students. 3-state segmented control per
  élève. Sticky bottom save bar with live counts.

- `src/routes/prof/tabs/appel/AppelProfTab.tsx`  
  Lobby with smart entry (hero / prochain / earlier-today / manual
  fallback). Drives the AppelScreen by passing classeId + matière +
  optional seanceId.

### Modified

- `src/types/models.ts`  
  Upgraded `PresenceSlot`: added `retards`, `pris_par_uid`, optional
  `seanceId`. Split `AbsentMark` and `RetardMark` types out cleanly.

- `src/routes/prof/ProfDashboard.tsx`  
  Added `{id: 'appel', label: 'Appel', icon: <ClipboardCheck/>}` between
  Notes and Emploi (chronological priority — appel happens during/after
  the day's classes; notes happen later).

## Firestore rule needed

Before this works in production, add a rule for `/classes/{}/presences/`.
Most likely it's already covered by the existing class rule (classes is
open-write-for-staff in your current ruleset), but verify by trying to
save an appel — if it fails with permission-denied, add:

```
match /classes/{classeId}/presences/{date} {
  allow read: if isStaff() ||
    (request.auth != null && exists(/databases/$(database)/documents/classes/$(classeId)/eleves/$(request.auth.uid)));
  allow write: if isStaff();
}
```

(The read clause stays open for the future élève "voir mes absences"
view in 5d.2, gated by the class membership pattern you already use.)

In a quick-test scenario, the simpler open-staff version is enough:

```
match /classes/{classeId}/presences/{date} {
  allow read: if true;
  allow write: if isStaff();
}
```

## What's NOT in this phase

- **Élève / parent self-declared absences** — Phase 5d.2. Different
  collection (`/classes/{}/eleves/{}/absences/{auto}`), different write
  rules, different time-locks.
- **PP / admin overview** — Phase 5d.2. PP needs cross-prof view of
  attendance for their PP class; admin needs school-wide monitoring.
- **Time-locks on self-declaration** — Phase 5d.2. Currently anyone with
  staff auth can save an appel any time; this is correct because profs
  legitimately back-fill missed appels.
- **Notification to parents on absence** — Future phase (push or SMS,
  not decided yet).
- **Auto-suggest absentees** based on previous-day patterns — much later,
  if at all.
- **Print/export** of daily attendance — useful for admin; ship if asked.

## Testing priorities

1. **Smart entry** — mid-class on a weekday, open Appel tab; the live
   séance should appear as the green hero with pulsing dot. Tap "Faire
   l'appel" → land on the right class + matière.

2. **3-state toggle** — flip a few students between the three states,
   verify stat counters update live.

3. **Default-Présent** — open a fresh appel, all rows green by default.
   Hit Save with nothing flipped → confirm dialog appears.

4. **Re-take** — save an appel, close, reopen the same one. Marks should
   re-hydrate; banner should show "Déjà pris par <you>"; save button
   label = "Mettre à jour".

5. **Search filter** — open a class with >8 students, type a name,
   verify the list narrows.

6. **Manual mode** — pick a class + matière (where prof has only one
   matière, picker shouldn't appear; with 2+, picker should). Hit
   "Commencer l'appel".

7. **Mobile UX** — on a phone, the segmented control buttons should be
   44×44 (touch target rule), the sticky save bar shouldn't overlap
   content (bottom padding pb-32).

8. **Onsnapshot live** — on device A save an appel; on device B with
   the same matière open, the slot should re-hydrate instantly via the
   live listener.
