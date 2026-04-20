# RT-SC · Phase 3d-iii.1 — Transition modal class-switch fix

Quick patch fixing the bug you spotted: the Transition modal showed "16 échoués · Maintenus dans 3ème M1" even though 3ème M1 only has 1 élève (the 16 came from 1ère D2 which you'd selected previously).

## Root cause

The modal kept its `decisions` state when you went back to step 1 and picked a different source class. So the class-A élèves' decisions were still in state when class B was displayed. The Review step counted ALL decisions in state (15 from class A + 1 from class B = 16) and labeled them all as belonging to class B.

If you had clicked "Lancer la transition", the actual write path iterates `pendingEleves` (the live list from the current class), so only the 1 real élève would have been processed. **No data corruption would have occurred** — but the UI lied about what it was going to do, which is unacceptable for a destructive operation.

## The fix (two layers — defense in depth)

1. **Reset state on source-class change** — clear `decisions` and `destinations` whenever `sourceClasseId` changes. So switching classes always starts fresh.
2. **Make `counts` derive from `pendingEleves`** — even if state somehow leaked again in the future, the displayed counts would still match what's actually in the list. The counts iterate over `pendingEleves` (the real élèves) and look up each one's status in `decisions`, instead of iterating over `decisions` directly.

Both fixes go together. Either one alone would be enough, but both together make the bug structurally impossible to reintroduce.

## Apply

```bash
cd ~/RT-SC && unzip -o ~/storage/downloads/RT-SC-phase3d-iii-fix.zip
```

No `npm install` needed. Vite hot-reloads.

## Test

1. Open Transition modal → pick **1ère D2** → step 2 shows 15 élèves
2. Mark a few as Admis, others as Échoué (or leave defaults)
3. Click Retour → back to step 1
4. Pick **3ème M1** → step 2 should show only the 1 élève that's actually in 3ème M1, with no inherited decisions
5. Continue → step 4 Review shows correct counts: e.g. "1 échoué · Maintenu dans 3ème M1"

Verify the same for Step 3 (Destinations) — picking a new class should clear any previously-set destinations.

## What's NOT in this fix

- Phase 4 work — that's still next
