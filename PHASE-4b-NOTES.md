# RT-SC · Phase 4b — Prof Notes Workflow

The prof side comes alive. **Profs can now actually do their daily work** — enter notes for their assigned classes with autosave, see their classes at a glance, and lock periods when they're done.

## What's new

| Area | Status |
|---|---|
| Prof dashboard | **Real** (replaces Phase 0 stub) — adaptive nav, 4 tabs |
| Prof → Notes tab | **Functional** — class/matière/period grid with autosave |
| Prof → Mes classes tab | **Functional** — read-only overview with PP badge |
| Prof → Annonces tab | Placeholder (Phase 6) |
| Prof → Plus tab | Placeholder (Phase 5+) |
| Period auto-detection | New helper `currentPeriode()` based on Bénin school year |
| Per-cell autosave | New generic hook `useDebouncedSave` |

## How the daily workflow works

1. **Prof logs in** → lands on the dashboard (defaults to Notes tab)
2. **Three selectors at the top**: Class / Matière / Period
   - Class: only the prof's assigned classes appear
   - Matière: only matières the prof teaches appear (intersection of `profil.matieres` and `ecole/matieres`)
   - Period: auto-defaults to the current period based on `BulletinConfig` + today's date in the Bénin school calendar (Oct → June). User can override.
3. **Single-class profs / single-matière profs**: the dropdowns auto-fill their only option, so the prof just sees the grid immediately
4. **Grid renders one row per élève**:
   - On desktop: real `<table>` with columns `N° · Élève · I1 · I2 · I3 · Dev. 1 · Dev. 2 · M.I. (computed) · Moy. (computed)`
   - On mobile: stacked cards, one per élève, with the moyenne shown prominently in the top-right
5. **Type a value** → 500ms after the last keystroke, the row autosaves to Firestore
6. **Per-cell visual indicator**: tiny dot (typing/pending) → spinner (saving) → green check (saved, fades after 1.5s) → red alert (error)
7. **The M.I. and Moy. columns recompute live** as you type (using the Phase 0 bulletin engine)
8. **"Calculer & Clôturer la période" button** at the bottom: runs the engine, marks every row as `estCloture: true`, locks the inputs (visible green border + lock icon)

## Period auto-detection

I added two helpers to `lib/bulletin.ts`:

- `listPeriodes(typePeriode, nbPeriodes)` — returns `['Trimestre 1', 'Trimestre 2', 'Trimestre 3']`
- `currentPeriode(typePeriode, nbPeriodes, now?)` — based on `now` (defaults to today) and the Bénin school year:
  - **Trimestre with 3 periods** (most common): Oct-Dec → T1, Jan-Mar → T2, Apr-Jun → T3
  - **Semestre with 2 periods**: Oct-Jan → S1, Feb-Jun → S2
  - **Off-season** (Jul-Sep): returns the LAST period (assumption: admin is finalizing previous year)
  - **Fallback** for non-standard configs: even split starting from October

So when a prof opens the tab in mid-November, the period dropdown is already pre-set to "Trimestre 1". One less tap.

## Visual design

- **Locked rows** (clôturé): light green tint background, lock icon next to the name, inputs disabled
- **Status dot per cell**: tiny indicator in the top-right corner of each input. Doesn't crowd the cell.
- **Out-of-range values** (>20 or <0): red border + red text + danger background, but the input still accepts the value (warn-don't-block — sometimes the prof types a placeholder)
- **Mobile cards** use the same colors but stack the 3 interros on one row, then dev1/dev2/M.I. on a second row, with the moyenne prominent at the top-right

## Required Firestore index

⚠️ **First time this tab loads with real data, Firestore will need a composite index** on the `notes` collectionGroup (matiere + periode).

The index is already in `firestore.indexes.json` (shipped in Phase 4a). Two ways to create it:

### Option A: Auto-prompt
Open Chrome DevTools console (long-press the URL bar in mobile Chrome → "Open in computer" or use Firefox Mobile DevTools, OR connect a USB cable to a desktop and use chrome://inspect). When the query fails, Firestore will print an error with a one-click URL like:
```
https://console.firebase.google.com/.../firestore/indexes?create_composite=...
```
Tap that URL → 2 clicks in Firebase Console → done in ~2 minutes.

### Option B: CLI (if you have firebase-tools installed)
```bash
cd ~/RT-SC && firebase deploy --only firestore:indexes
```

Either way, until the index is built, the grid will show an empty state for any élève without notes (and the autosave will fail silently for the collectionGroup query — but the per-élève save still works).

## What to test

1. Apply the patch
2. Sign in as **a prof** (not admin) who has at least one class assigned and at least one matière in their profile
3. Land on the dashboard — the Notes tab should be active
4. **Class/Matière auto-fills** if you only have one option each; otherwise pick from the dropdowns
5. **Period** should auto-detect to "Trimestre 1" (or appropriate based on today's date)
6. **Type a value in one cell** — see the typing dot appear → after 500ms, spinner → check
7. **Type partial decimal** like "12." — should accept, complete with "12.5", commit
8. **Type out-of-range** like "25" — red border, but doesn't block
9. **Clear a cell** (backspace to empty) — saves as null, the moyenne column updates
10. **Refresh the page** — your saved values are still there
11. **Click "Calculer & Clôturer la période"** — confirm dialog → all rows lock with green tint + lock icon → toast confirms
12. After clôture: try to edit a locked row — inputs are disabled
13. **"Mes classes" tab** — see your assigned classes as cards, with PP badge if you're principal of any
14. **Tap a class card** → jumps to Notes tab pre-filled with that class

## Multi-prof concurrent edit

If two profs of the same matière open the grid for the same class+period at the same time and edit different cells, the live snapshot keeps both screens in sync. **However**, if both edit the SAME cell, last-write-wins (no merge logic).

This is a deliberate Phase 4b limitation — the rare case isn't worth the engineering cost. Adding it would require operational transforms or a separate per-cell document, both heavy. We'll revisit only if it becomes a problem.

## Notes on the bulletin engine integration

The grid uses the existing pure functions from `lib/bulletin.ts`:
- `moyenneInterros(interros: number[])` — mean of non-null interros
- `moyenneMatiere({ moyenneInterros, devoir1, devoir2 })` — average of the components present (filters out nulls), returns null if all three are null

These are the canonical functions; bulletin computation in Phase 4d will call the same ones.

## What's NOT in Phase 4b

- **Closure intelligence** (Layer A completeness check + Layer B trend check + PP preflight) — **Phase 4c**
- **Bulletin generation** (per élève + per class) — **Phase 4d**
- **PDF export** — **Phase 4d**
- **"Vue par élève"** (one élève, all matières) — defer to 4d when bulletins exist
- **Colle entry from prof side** — defer to 4c
- **Undo last save** — defer; autosave + ability to retype makes this less urgent
- **Bulk actions** (e.g. "set all I1 to 12") — defer; would need careful UX

## Where this leaves us

```
Phase 4a   ✅ Foundations + admin editors
Phase 4b   ✅ Prof note entry              ← we are here
Phase 4c   ⏭  Closure intelligence (Layer A + B + PP preflight)
Phase 4d   ⏭  Bulletin display + PDF export
```

After Phase 4d, the "core academic loop" is complete. Profs enter notes, periods get closed with intelligence, bulletins generate, élèves and parents can view them.
