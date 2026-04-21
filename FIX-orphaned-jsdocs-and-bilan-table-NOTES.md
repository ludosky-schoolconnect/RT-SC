# Fix patch — orphaned JSDocs + per-class bilan table

## 1. Syntax error killing the élève space — fully fixed

The previous patch only fixed ONE orphaned JSDoc block. Three more
were still in the file at lines 159, 195, 218, plus a corrupted line
212 where `}` and `Convert "HH:mm"...` were concatenated into a single
malformed line.

### Why the incremental approach kept failing

When I inserted the new `hasVerrouToday` + `checkOngoingClass`
helpers via `str_replace`, my reasoning about whether each JSDoc
needed the `/**` opener was inconsistent. The first block got it.
Blocks 2, 3, 4 didn't. The `} Convert...` corruption happened when
a closing brace of `OngoingClass` interface collided with the
next JSDoc opener's content during that same str_replace.

### Fix

Rewrote the entire file cleanly in one shot. All four JSDoc blocks
now have proper `/** ... */` delimiters. All braces close correctly.
Logic unchanged — same quota rules, same verrou, same ongoing-class
check — just properly formed syntactically.

Verified by running esbuild/tsc parse on the file — no errors.

## 2. Per-class bilan — sortable full roster

### What's new

When you toggle the bilan to "Par classe" and pick a class, the
result now shows a **full sortable table of every élève in the class**,
not just the top 10 retards. Columns:

- **Élève** (sort asc/desc by name)
- **Versé** (sort by paid amount)
- **Reste** (sort by outstanding balance — default)
- **État** (sort by Soldé → Partiel → Aucun paiement)

Click any column header to sort. Click again to flip direction.
All sorting happens in-memory (class rosters are bounded at ~30-50
students), no re-fetches.

### What's NOT changed

- **Global scope** still shows "Top 10 retards" only. Rendering
  500+ élèves with listeners per row would be a perf problem;
  the top-retards view serves that scope well.
- The "Par classe" toggle + class picker were already built in a
  previous phase — only the full-roster table is new.

### Export updates

Both CSV and PDF exports now emit the **full roster with état
column** when in per-class scope (`allRows` present). Global scope
still emits "Top retards" as before.

- CSV filename: `bilan-finances-4eme-m1-20260421-0700.csv`
- PDF title: "Bilan financier — 4ème M1" with the full table below

### Implementation

- `Bilan` interface: new optional `allRows: BilanRow[]` field
- `computeBilan()`: new `retainAll` boolean param; when true, sorts
  and retains the full rows array
- Call site passes `retainAll = scope === 'classe'` — zero memory
  overhead for global scope
- `BilanClassTable` component: state-managed sort (`sortKey`,
  `sortDir`), useMemo-based in-place sort, SortHeader subcomponent
  with asc/desc/neutral arrow icons
- Export functions branch on `bilan.allRows` presence — full
  roster when defined, top-retards list otherwise

## Files changed

- `src/hooks/useEleveAbsencesMutations.ts` — complete clean rewrite
  (no logic change, just fixes all four orphaned JSDoc blocks + the
  corrupt line 212)
- `src/routes/admin/tabs/finances/BilanGlobalCard.tsx` — new
  `BilanClassTable` + `SortHeader`, `Bilan.allRows` field,
  `computeBilan` retainAll flag, export branches on per-class data

## Test

1. Apply zip
2. Hard refresh — élève space should load without the vite error
3. Go to Plus → Finances → Bilan
4. Toggle "Par classe" → pick a class → click Calculer
5. Verify full class table appears with sort arrows on Élève / Versé
   / Reste / État headers
6. Click "Reste" header twice to verify asc/desc flip
7. Click Exporter → CSV → open file → verify all students listed
   with État column
8. Click Exporter → PDF → verify full table + proper title
9. Toggle back to "Global" → verify top-retards view still works

## What's NOT in this patch

- No rules changes
- No changes to terminal de caisse / guichet / any other surface
