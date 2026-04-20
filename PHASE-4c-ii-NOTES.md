# RT-SC · Phase 4c-ii — PP Cross-Matière Dashboard + Layer B + Bulletin Generation

The biggest single phase yet. **Professeurs Principaux can now actually generate the period bulletins** with cross-matière completeness checks, mode-based outlier detection, automatic ranking, and full unlock controls if they need to undo something.

Plus a **bonus bug fix** for the modal-opens-then-closes issue you spotted on first click.

## What's in this patch

| Area | Status |
|---|---|
| Modal first-click bug | **Fixed** — `target===currentTarget` guard on overlay |
| `lib/layerB.ts` | New — pure mode-based outlier detection |
| `lib/bulletinGeneration.ts` | New — preflight + compute + write orchestrator |
| Unlock matière (PP) | New — `useUnlockMatiere` hook |
| Unlock bulletins (PP) | New — `unlockBulletinsForPeriod` function |
| Cross-matière table | **Functional** — sticky col, state-aware cells, Layer B flags |
| Bulletin generation modal | **Functional** — preflight + execute + result |
| BulletinsMode | **Functional** — full PP dashboard wired end-to-end |

## The modal-close bug

You spotted that the closure modal opened then immediately closed on first click. Cause was a React 18 portal event-bubbling race:

1. You tap "Calculer & Clôturer" — button's onClick fires
2. State update → modal portal mounts
3. The same physical click event continues bubbling **through React's synthetic event system** (which crosses portal boundaries)
4. It reaches the freshly-mounted modal overlay's onClick → overlay closes the modal that just opened

Fixed in `src/components/ui/Modal.tsx` by checking `e.target === e.currentTarget` on the overlay onClick — only direct overlay clicks close the modal now, bubbled events from descendants (and from the open trigger itself) are ignored.

## Layer B — mode-based outlier detection

For each matière, we count how many "data points" (interros + devoirs filled) each élève has. The **mode** of that distribution = the most common count. Élèves below the mode get flagged.

Decision spec (the one we agreed on):
- Ties favor the higher count (so 7 with 4 points vs 7 with 3 → mode = 4 → the 7 with 3 get flagged)
- Élèves marked abandonné are excluded from the calculation entirely
- Empty/missing notes count as 0 (so they're flagged)

In the cross-matière table, flagged élèves get a small ⤓ icon next to their name with a tooltip explaining "moins de notes que la majorité de la classe — vérifiez". It's informational only — doesn't block bulletin generation. The PP can review the flag, decide to ignore (probably a real outlier) or take action (re-open the matière for that prof).

## Cross-matière table — the visual centerpiece

Rows = élèves, columns = matières (filtered to those with coefficients for this class's niveau/série). Sticky first column for horizontal scroll usability. Last column shows "Bull. OK" when a bulletin doc exists for that élève.

Per-cell visual states:
- **Closed, with moyenne** → number in green (≥10) or red (<10)
- **Closed, abandonné** → "Abs." badge in warning color
- **Closed, no moyenne** → "—" muted
- **Not yet closed** → "·" light gray
- **No coefficient** → cell hidden (matière isn't taught at this level)

Below the table: a small legend explaining each state.

## Bulletin generation flow

**Preflight runs first.** Checks every potential failure:

1. Coefficients exist for the class's niveau/série (block if not)
2. Conduite coefficient exists (block if not)
3. baseConduite is set in BulletinConfig (block if not)
4. Every matière for every élève is either Closed OR Abandonné (block if any are still in the prof's hands — lists them by name)
5. Closed-but-empty matières flagged as warnings (proceed but won't contribute)
6. Class has at least one élève (block if empty)

**Errors block; warnings allow.** If everything passes (or has only warnings), the Confirmer button enables.

**Execute writes one Bulletin doc per élève** at `/classes/{cid}/eleves/{eid}/bulletins/{periode}`. Doc id = period name (so re-running overwrites — idempotent). All in a single Firestore batched write (500-op cap, classes are small enough).

Each bulletin doc gets:
- `moyenneGenerale` (with abandoned matières excluded from the denominator)
- `totalPoints`, `totalCoeffs` (for transparency)
- `noteConduite` (baseConduite minus colle hours / 2)
- `totalHeuresColle` (sum of colle hours for this period)
- `coeffConduite`
- `rang` (e.g. "3ème/30", "1er ex/30")
- `estVerrouille: true`
- `dateCalcul` (ISO string)

After execution, the table shows the "Bull. OK" badge per élève. Re-opening the modal shows "Régénérer" instead of "Générer" with a warning that existing bulletins will be overwritten.

## PP unlock controls

You called out (rightly) that PP needs override capability. Added a collapsible "Actions PP — déverrouillage" section between the table and the action row. Two unlock surfaces:

### 1. Unlock a matière

Lists every fully-closed matière as a button. Tap one → confirm dialog → every élève's note for that matière gets `estCloture: false` + cleared moyennes. The prof can now go back into Saisie mode and edit. The abandon flag is preserved (decisions stand).

Note: existing bulletins aren't touched by matière unlock — they just become stale. The PP regenerates after corrections via the existing flow.

### 2. Supprimer les bulletins de la période

Single danger button when bulletins exist for the period. Tap → confirm dialog → deletes all bulletin docs for the period. Notes themselves are NOT modified. PP can then regenerate with corrected data.

Both actions only appear when there's something to unlock (no fully-closed matières AND no bulletins → section hidden entirely).

## Required Firestore index

Added a single-field collectionGroup index on `notes.periode` to `firestore.indexes.json`. The cross-matière query needs it.

If you haven't deployed indexes yet, the auto-prompt method works: when the query first fails in the browser, Firebase prints a one-click URL in the console.

CLI method (if you have it):
```bash
cd ~/RT-SC && firebase deploy --only firestore:indexes
```

## What to test

You'll need to actually have a prof who's PP, with at least one class that has élèves and a few closed matières. Setup:

1. As **admin**: assign yourself (the test prof) as PP of one class
2. As **the prof**: enter notes for a couple of matières, run "Calculer & Clôturer" on each (resolving any non-Complet élèves via Layer A)
3. Switch to **Bulletins mode** (the pill switcher at the top of Notes tab)

Then test:

### Cross-matière table

1. Pick the class + period — table renders one row per élève, one column per matière with coefficients
2. Closed matières show numbers in green/red
3. Non-closed matières show "·"
4. If you marked anyone Absent, their cells show "Abs." badge
5. Layer B outliers (élèves with notably fewer data points) get a ⤓ icon next to their name

### Generation modal

1. Click **Générer les bulletins** (modal won't open if not enough matières are closed — preflight will block)
2. Modal shows the recap (élève count, matière count, conduite coef)
3. If errors exist, Confirmer is disabled with a list of issues
4. If only warnings, Confirmer enables
5. Click Confirmer → spinner → success screen
6. Verify in Firestore Console: `classes/{cid}/eleves/{eid}/bulletins/{periode}` should exist with `moyenneGenerale`, `rang`, etc.

### Unlock controls

1. After at least one matière is fully closed, the "Actions PP — déverrouillage" disclosure appears
2. Tap the disclosure → expands
3. Each fully-closed matière appears as a button
4. Tap a matière button → confirm dialog → note docs become editable again (verify by switching back to Saisie mode for that matière — cells should no longer be locked)
5. After bulletins are generated, "Supprimer les X bulletins" button appears
6. Tap → danger-variant confirm → bulletins deleted (verify in Firestore Console)

### Modal-close bug verification

1. Go back to Saisie mode
2. Enter a note for an élève
3. Click "Calculer & Clôturer" — modal should open and STAY open (not close immediately like before)

## Edge cases handled

- **Re-running generation** when bulletins already exist: shows "Régénérer" + a yellow warning about overwrites
- **Class with no PP** trying to access Bulletins mode via URL: silently falls back to Saisie
- **Coefficients not yet set** for the class's niveau/série: preflight blocks with a clear error message
- **Élève marked Absent in every matière**: their bulletin will have `moyenneGenerale = 0` since no subjects contribute; PP should review before publishing
- **Concurrent edits during generation**: the orchestrator reads everything once at the start; if a prof edits mid-generation, the generated bulletin reflects the snapshot taken at start (last-write-wins)
- **Single-class PP / single-period**: selectors auto-fill

## What's NOT in this patch

- **Per-matière rank in NotesGrid** — Phase 4c-ii.1 (next, small additive)
- **Baromètre (class health card)** — Phase 4c-ii.1 (next)
- **Annual finalization** (moyenne annuelle, statut Admis/Échoué) — Phase 4c-iii
- **Bulletin display screen** for élèves and parents — Phase 4d
- **PDF export** — Phase 4d
- **PP override of an élève's abandon flag** — defer; the prof's per-élève Layer A decisions stand for now

## Status

```
Phase 4a       ✅ Foundations + admin editors
Phase 4b       ✅ Prof note entry
Phase 4b.1     ✅ Build fix + period dates
Phase 4b.2     ✅ Dynamic interros + NaN fix + closure guard
Phase 4b.3     ✅ Hotfix oversized buttons
Phase 4c-i     ✅ Layer A intelligence + role surfacing
Phase 4c-ii    ✅ PP cross-matière + Layer B + bulletin generation + unlock     ← we are here
Phase 4c-ii.1  ⏭  Per-matière rank + Baromètre (small additive)
Phase 4c-iii   ⏭  Annual finalization
Phase 4d       ⏭  Bulletin display + PDF
```
