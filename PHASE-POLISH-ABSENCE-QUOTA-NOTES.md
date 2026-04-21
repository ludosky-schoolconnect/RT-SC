# Polish batch 2 — absence quota fix + public form school name + rules

Four related fixes bundled into one patch to address issues surfaced
while testing Phases 6b/6c.

## 1. Absence quota — count by action time, not target date

### Bug

Previous `checkQuota` counted same-day absences by comparing the
declared absence's `date` (the target day the absence is FOR) against
the date the user was trying to declare. Per the legacy behavior
(confirmed from `app.js` line 17071+), quotas should be keyed on
**when the user actually clicked submit** (the `createdAt` timestamp),
not on the target date.

### Why it matters

The spam vector: a parent could click declare 10 times in one session,
each time picking a different target date (next Friday, last Monday,
etc.), and never hit the quota because no two declarations had the
same target. With action-time keying, all 10 clicks are on the same
day → quota trips after 1.

### Fix

`checkQuota(existing, _forDate, now?)` now:

- **Daily (1 max)** — filters absences where `createdAt` falls in
  today's calendar day. If count >= 1, block.
- **Weekly (3 max)** — filters absences where `createdAt` falls in
  this week's Monday-Friday window. If count >= 3, block.
- **Source filter** — only `source !== 'appel_prof'` counts. Prof-
  marked absences don't consume self-declaration budget (matches
  legacy line 17095).
- **Fallback** — if a doc has no `createdAt` (very old vanilla data),
  falls back to `date`. Not perfect, but doesn't break on legacy rows.

The `forDate` argument is kept in the signature (marked `_forDate`)
for call-site compatibility — no caller had to change.

## 2. verrouToday lock

### What it does

If a prof marked the élève absent TODAY via appel, the élève/parent
CANNOT self-declare. Prevents racing against the official record.

### Implementation

New `hasVerrouToday(classeId, eleveId)` async helper reads today's
presence doc at `/classes/{cid}/presences/{YYYY-MM-DD}`. Iterates the
matière slots looking for this eleveId in any `absents` map. Returns
true → block.

Modal checks this once per open (cheap: one getDoc). If locked, shows
a red banner:

> **Déclaration bloquée pour aujourd'hui**
> Un professeur vous a marqué absent(e) aujourd'hui lors de l'appel.
> Pour toute justification, présentez-vous à la direction.

Submit button disabled. Catch-all on submit path also rejects if the
banner somehow clears mid-click.

### Failure mode

Network error reading the presence doc → fail open (don't block).
Worst case: a duplicate entry that admin sees in triage and cleans up
via the merge UI. Better than blocking legitimate declarations due to
flaky network.

## 3. Emploi du temps check — no declaring during class hours

### What it does

If the élève's class has a seance in progress RIGHT NOW (today's
weekday + current time between heureDebut and heureFin), the form is
locked until the class ends.

### Why

Prevents the absurd case: student declares "I'm absent from Math
10h-12h" at 10h30, while supposedly IN the Math class. Either they're
actually there (form is moot) or they're actually absent (prof will
mark it via appel — triggers verrouToday instead).

Declarations are meant to be ADVANCE notices. Filing one during the
very class you're claiming to miss is absurd.

### Implementation

New `checkOngoingClass(classeId)` reads
`/emploisDuTemps/{classeId}/seances/*`. Finds any seance where:
- `jour.toLowerCase() === current French weekday name` (lundi, mardi, …)
- `heureDebut <= now < heureFin`

Returns `{ matiere, heureFin }` if one is found, else null.

Modal polls every 60 seconds while open so the form unlocks itself
when class ends — no user action needed. If locked, shows an amber
banner:

> **Cours en cours — déclaration indisponible**
> Mathématiques est en cours jusqu'à 12h00. La déclaration redeviendra
> disponible automatiquement après la fin du cours.

Submit button disabled.

### Failure mode

If the class has no emploi du temps configured (common for new
schools), `checkOngoingClass` returns null → no lock, form available
24/7. This is intentional: schools without a configured schedule
shouldn't be locked out.

## 4. Drop the 06h-18h Firestore rule window

### Change

Per our discussion (Option A), remove the time-window guard from the
absence rule. Client-side checks (quota + verrou + ongoing class) are
now comprehensive enough to replace it. A parent declaring at 22h
after work is legitimate — blocking them by a blunt hour window is
hostile UX.

### Rule update

Replace your current rule:

```
match /absences/{document=**} {
  allow read: if isStudentOf(classeId, eleveId) || isParentOf(classeId, eleveId) || isStaff();

  allow create: if isStaff() ||
    ( (isStudentOf(classeId, eleveId) || isParentOf(classeId, eleveId))
      && request.time.hours() >= 5 && request.time.hours() < 17 );

  allow update, delete: if isStaff();
}
```

With:

```
match /absences/{document=**} {
  allow read: if isStudentOf(classeId, eleveId) || isParentOf(classeId, eleveId) || isStaff();

  allow create: if isStaff() ||
    isStudentOf(classeId, eleveId) || isParentOf(classeId, eleveId);

  allow update, delete: if isStaff();
}
```

No time restriction; identity check still enforced.

### Protections remain

- **Spam** — client quota (1/day, 3/week). Enforced before network.
- **Contradicting appel** — verrouToday check.
- **Unreasonable timing** — emploi du temps check.
- **Auth** — rules still require the élève's or parent's session UID
  to match the stored `active_session_uid` / `active_parent_session_uid`.

## 5. Parent reprogrammer rule (from Phase 6c, reminder)

This isn't part of the polish batch code, but needs deploying
alongside the 06h-18h removal. Current rule blocks parent-side
reprogrammer because parent is unauth.

Update `/pre_inscriptions` rule to allow ONLY the specific reprogram
fields to be updated unauth:

```
match /pre_inscriptions/{piId} {
  allow create: if true;
  allow read: if true;
  allow update: if isStaff() || (
    request.resource.data.diff(resource.data).affectedKeys()
      .hasOnly(['dateRV', 'reprogCount']) &&
    resource.data.statut == 'Approuvé' &&
    request.resource.data.reprogCount == resource.data.reprogCount + 1
  );
  allow delete: if isStaff();
  match /documents/{docId} {
    allow create: if true;
    allow read, write: if isStaff();
  }
}
```

Server-side this enforces:
- Only `dateRV` + `reprogCount` fields can be changed unauth
- Only dossiers currently in `Approuvé` statut (can't re-open refused
  or finalized)
- reprogCount must increment by exactly +1 (can't spoof back to 0)

Combined with client-side 3-cap, parent reprogrammer is safe.

## 6. School name/adresse/telephone on public inscription form

Minor polish — the public form header was generic "Portail
d'inscription" with no school branding. Now reads `/ecole/config`
(unauth read already allowed by your rules) and displays:

- School name (uppercase gold-dark, above the main title)
- Adresse + telephone (small, below the subtitle)

If the fields aren't set, the header gracefully falls back to the
generic layout.

This makes the public link more professional — parents landing on
`/inscription` see WHICH school they're registering for.

## Files changed

### Code
- `src/hooks/useEleveAbsencesMutations.ts` — rewritten quota logic,
  new `hasVerrouToday` + `checkOngoingClass` + `OngoingClass` type
- `src/routes/_shared/absences/ModalDeclareAbsence.tsx` — imports
  new helpers, state for verrouToday + ongoing, 60s poll for ongoing,
  two banners + submit-button lock
- `src/routes/inscription/InscriptionPage.tsx` — reads `ecole/config`
  and renders school identity in the header

### Rules (deploy separately)
- Drop time-window guard from `/absences` create rule
- Allow unauth reprogrammation of `/pre_inscriptions` with field
  + cap enforcement

## Tests

1. **Quota — daily** — declare an absence successfully. Try to declare
   another one the same day for ANY target date → should see "Vous
   avez déjà déclaré une absence aujourd'hui. Réessayez demain."

2. **Quota — weekly** — across Mon-Fri, declare 3 times (on different
   days). On the 4th attempt, should see "Limite hebdomadaire atteinte".

3. **verrouToday** — admin/prof marks an élève absent via appel for
   today. As that élève (or their parent), open the declare modal →
   should see the red banner immediately, submit disabled.

4. **Ongoing class** — configure emploi du temps with a seance for
   "lundi 10:00 - 11:00". On a Monday at 10:30, open declare modal →
   should see the amber banner. Wait until 11:01 (or spoof time via
   devtools) → banner clears, form becomes usable.

5. **No emploi du temps** — on a class without EDT seances, declare
   modal opens normally regardless of time.

6. **Deploy the rules update**, then verify a declaration at 22h goes
   through (previously blocked by the 06h-18h rule).

7. **Public form school name** — set `/ecole/config.nom = "CEG HOUETO"`,
   + adresse + telephone. Open `/inscription` → header shows school
   identity above "Portail d'inscription".
