# RT-SC · Phase 4b.2 — Dynamic interros + NaN fix + closure guard

Three fixes in one small patch, all addressing real workflow problems you spotted on the prof Notes screen.

## What changed

### 1. Dynamic number of interros (1 to 10)

Profs vary in how many interros they give per period. Hardcoding 3 was wrong. Now each row has its own variable count:

- **Starts with 1 interro slot** by default
- **"+" button** at the end of each row's interros adds another slot (up to MAX = 10)
- **"×" button** on each interro removes that slot (down to MIN = 1)
- The remove button shows on hover (desktop) or always (mobile, where there's no hover)
- The moyenne calculation already handled variable-length arrays correctly (it's `mean of non-null values`), so no engine change was needed
- When you remove an interro slot, the saved data updates accordingly — no orphan values stored
- When clearing a cell mid-row, the slot stays visible (so cell positions don't shift while you type)

**Layout details:**

- **Desktop**: the table now has an "Interrogations" column instead of fixed I1/I2/I3 columns. The interros render as a horizontally-scrollable cluster within that column. With 10 interros, the cluster scrolls; with 1, it stays compact.
- **Mobile**: interros wrap in a flex layout. Adding more just stacks them naturally.

### 2. NaN moyenne fix

The "MOYENNE: NaN" you saw in red on empty rows was caused by `mm.toFixed(2)` being called on a `null` value (which JavaScript coerces to "NaN" when stringified through React).

The fix:
- New `fmt()` helper that returns `"—"` for null/undefined/NaN values
- Both desktop M.I./Moy. cells and mobile moyenne display now use it
- Empty rows render `—` instead of "NaN"
- Cells with all-null interros + null devoirs → moyenne is `—`
- Cells with at least one value → moyenne computes correctly

### 3. Closure precaution (lightweight Phase 4b.2 version)

Until Phase 4c ships the full Layer A/B intelligence, the closure flow now does the bare minimum check — counting fully-empty rows and warning before locking.

**The new behavior:**

- "Calculer & Clôturer" button still works the same when all rows have at least some data
- When some rows are completely empty (no interros AND no devoirs), the confirm dialog shows a stronger warning:
  ```
  ⚠️ X élève(s) ont aucune note saisie.
  Leur(s) moyenne(s) seront vide(s) dans le bulletin.
  
  La clôture définitive (avec contrôle de complétude par élève)
  viendra avec le module de bulletins.
  
  Continuer quand même la clôture simple ?
  ```
- The dialog uses the `danger` variant (red) instead of `warning` (orange) when empties exist, so it's harder to accidentally click through
- Empty rows that get locked store `moyenneMatiere: null` (not "NaN"), so bulletins later display them as `—`

This is **NOT the full Layer A/B intelligence** we discussed — that's still Phase 4c. Specifically, what's NOT in this guard:

- ❌ Per-élève per-matière "Élève abandonné" toggle (Layer A)
- ❌ Mode-based outlier detection across the class (Layer B)
- ❌ "Retour saisie" option to send the prof back to fix
- ❌ PP preflight before final close (cross-matière completeness)
- ❌ Class-wide ranking generation

What IS in this guard:
- ✅ Count of empty rows displayed before commit
- ✅ Stronger visual warning (danger variant) when empties exist
- ✅ Clear text saying "the proper version comes with the bulletin module"
- ✅ Empty rows store proper null (not NaN) on commit

Think of it as a tripwire — it prevents the silent lock you saw on your screenshot, but it's not the smart closure system. That's still the right approach for Phase 4c.

## Apply on Termux

```bash
cd ~/RT-SC && unzip -o ~/storage/downloads/RT-SC-phase4b.2.zip
```

No `npm install` needed. Vite hot-reloads.

## What to test

1. **Open the Notes tab** → the grid should look slightly different now (one "Interrogations" column on desktop instead of three I1/I2/I3 columns)
2. **All rows start with 1 interro** by default (instead of 3)
3. **Type a value in I1** → autosave fires
4. **Click the "+" button** at the end of the interros → a second interro slot appears
5. **Add up to 10** — the "+" disappears at 10
6. **Hover (desktop) or look (mobile) at any interro** → an "×" appears in the corner
7. **Click "×"** → that slot is removed
8. **Try to remove the last one** → not allowed (MIN = 1)
9. **Clear all cells on a row** (backspace each) → moyenne shows "—" not "NaN"
10. **Click "Calculer & Clôturer"** when some rows are empty → dialog shows the danger-variant warning with the count of empty rows
11. **Confirm** → empty rows get locked with `null` moyenne (bulletins later show `—`)
12. **Confirm with a row that has notes** → that row computes a real moyenne and locks normally

## Edge cases handled

- **Saved data with 5 interros** → row hydrates with 5 slots, you can add up to 5 more or remove down to 1
- **Saved data with 0 interros** → row shows 1 empty slot (the minimum)
- **Mid-array null** → cell stays visible in its position, save filters it out so the saved doc doesn't grow
- **Locked row** → the +/× buttons don't render
- **Concurrent edit on the same row** (rare): last-write-wins, same as before

## What's NOT in this patch

- The full closure intelligence (Layer A + B + PP preflight + ranking) — **Phase 4c**
- Per-matière abandon flag per élève — **Phase 4c**
- Bulletin display + PDF — **Phase 4d**

## Status

```
Phase 4a       ✅ Foundations + admin editors
Phase 4b       ✅ Prof note entry
Phase 4b.1     ✅ Build fix + period dates
Phase 4b.2     ✅ Dynamic interros + NaN fix + closure guard    ← we are here
Phase 4c       ⏭  Closure intelligence (full Layer A + B + PP preflight)
Phase 4d       ⏭  Bulletin display + PDF
```
