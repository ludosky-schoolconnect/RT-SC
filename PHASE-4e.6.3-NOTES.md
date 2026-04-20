# RT-SC · Phase 4e.6.3 — Existing-colles visibility + clearer lock semantics

Three things you raised. Addressing each carefully.

## 1. "Add colle → regenerate? Or must it always be delete first?"

You spotted an inconsistency: when notes are edited, the workflow is:
- Matière clôturé → notes locked → PP unlocks just the matière → prof edits → PP regenerates

But for colles I had:
- Bulletin generated → all colles locked → PP must DELETE bulletins → prof edits → PP regenerates

The "delete bulletins" step is heavyweight. Let me explain why that asymmetry exists in the current data model, and what we're doing about it.

### Why the asymmetry

Notes have an `estCloture` flag that locks ONE matière. The PP can flip this for one matière at a time without touching the bulletin doc.

Bulletins, by contrast, have only a `estVerrouille` flag — and the existing PP "Déverrouiller" UI doesn't flip the flag, it **deletes the bulletin doc entirely** (via `unlockBulletinsForPeriod`). So in the current system "exists" and "verrouillé" are equivalent.

That's why colles need the heavier workflow: there's no "intermediate state" where bulletin exists but is editable. The whole bulletin must be wiped to add inputs.

### Could we do "add colle while bulletin exists" + flag bulletin as stale?

Yes, technically. But it introduces a window where the live colle widget shows different data than the printed bulletin, which is exactly what families would dispute. For a school where bulletins go to families on paper, **stricter is safer**. We keep the lock.

### What we're improving

The lock UX is now much less procedural. The modal still opens when bulletin exists, but it shows:
- The full colle history for the period (read-only, so the prof can still SEE what's there)
- A clear notice explaining why entry is disabled and what the PP needs to do

A future Phase could add per-élève bulletin unlock (instead of "delete all bulletins for the period"), which would resolve the asymmetry properly. Not in scope here — it'd be part of a "Vie scolaire" PP surface in Phase 5+.

## 2. "Shouldn't the prof see previous colles given to that student?"

Yes — the BIG missing thing. Built it.

When the modal opens, above the form (or instead of it, if locked), there's now a **"Déjà sur cette période"** panel showing every colle on this (élève × période):

```
DÉJÀ SUR CETTE PÉRIODE (Semestre 1)         6h · −3 pts conduite
────────────────────────────────────────
2h · Maths              · 12 oct
   Donnée par M. Houessou · "Bavardage"

2h · SVT                · 03 oct
   Donnée par Mme Adjamonsi

2h · Français           · 22 sep
   Donnée par Mme Tossou · "Devoir non fait"
```

Each row: hours, matière, date, prof name, motif (if any). Profs now see if a student has 8h already and decide proportionally.

Empty state: "Aucune colle pour cette période." in subdued text.

The list reads from `useColles` (already live via onSnapshot), so it auto-updates if another prof issues one in another tab.

## 3. "The lock didn't actually fire — colle modal opened despite the matière being clôturé"

Diagnosis: **matière clôturé ≠ bulletin generated.** Two different things in the data model:

- `Note.estCloture = true` → ONE matière is finalized. Doesn't lock colles.
- `Bulletin` doc exists → the PP has run "Générer les bulletins" for the period. THIS is what locks colles.

In your test: SVT was clôturé but you hadn't yet gone to PP → Bulletins → Période 1 → Générer. So no bulletin doc existed for that élève/period. The modal correctly let you save.

Why the asymmetry in semantics? A colle is per-élève cross-matière (it affects conduite, which is one number for the whole period). It would be wrong to lock all colles for a period just because ONE matière clôturé — other matières might still be open, the PP hasn't decided to finalize the period yet, and other profs might still want to issue colles. The lock has to be at the period-level event ("PP finalized the period via bulletin generation"), not the per-matière event.

To verify the lock works:
1. Make sure ALL matières are clôturé for the period
2. PP → Bulletins → pick the period → "Générer les bulletins"
3. Wait for the success toast
4. Now go back to Notes → tap colle on any élève for that period
5. Modal shows the existing colles list + the LockedNotice (no entry form)

## Misc fixes in this patch

- Modal size bumped from `sm` to `md` because the colles list needs more breathing room
- Footer adapts: locked state shows only "Fermer", normal state shows "Annuler / Enregistrer la colle"
- Form heading is "Nouvelle colle · nombre d'heures" so it's clear which colle the form is for vs the existing list above
- Motif hint clarified: "visible uniquement par les profs" (was "ne sera pas affiché dans le bulletin", which was also true but less informative)

## Apply on Termux

```bash
cd ~/RT-SC && unzip -o ~/storage/downloads/RT-SC-phase4e.6.3-collehistory.zip
```

Vite hot-reloads.

## What to test

### Existing colles list (the new feature)

1. Sign in as prof → Notes → pick a class + matière + period
2. Tap colle icon on an élève who has at least one colle already
3. Modal opens, "Déjà sur cette période" panel at top shows the existing colle(s) with date, prof name, motif
4. Tap colle on an élève with NO colles for the period → panel shows "Aucune colle pour cette période."
5. Add a colle, save. Reopen the modal → the new colle appears in the list at the top (newest first)

### Lock with existing colles visible

1. Generate bulletins for a period (PP → Bulletins → période → Générer)
2. Go back to Notes → tap colle on any élève for that period
3. Modal opens with: "Déjà sur cette période" list (so you can see what's there) + LockedNotice (no entry form)
4. Footer shows only "Fermer"

### Bug regression check

1. Period with no bulletin → modal lets you save normally
2. Toast confirms after save
3. No "Session prof invalide" anywhere

## Status

```
Phase 4e.6.3   ✅ Existing colles + clearer lock     ← we are here
Phase 4e.1     ⏭ PDF en lot + multi-child parent
Phase 5        ⏭ Daily ops + finer-grained PP unlock (per-élève)
```

A future "Vie scolaire" surface (Phase 5+) for the PP would let them: see all colles for the class, delete erroneous ones, AND unlock individual bulletins (instead of nuking the period). That gets us closer to your "less procedural" instinct without sacrificing data integrity.
