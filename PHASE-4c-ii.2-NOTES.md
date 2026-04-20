# RT-SC · Phase 4c-ii.2 — Hotfix: moyenne not persisting + Recalculer button cleanup

Two-file hotfix addressing the issues you spotted in the screenshots.

## Bug 1 (critical): `moyenneMatiere` was never computed correctly

The engine function in `lib/bulletin.ts` had a positional signature:

```ts
moyenneMatiere(mi, dev1, dev2)
```

But every caller in the app uses an object form:

```ts
moyenneMatiere({ moyenneInterros: mi, devoir1, devoir2 })
```

So every call was actually invoked as `moyenneMatiere({ ... }, undefined, undefined)`. The function would push the entire object onto its components array, then try to average it with `reduce((a, b) => a + b, 0)` — which produces `NaN` (or stores something like `"[object Object]0"` after string coercion). Either way: garbage.

That's why your closed row showed `MOYENNE: —` even though the M.I. computed correctly (M.I. uses a different function with the right signature).

And it cascaded:
- **Baromètre didn't render** because it filters out élèves whose `moyenneMatiere` is null/NaN — every closed élève was filtered out → empty array → no baromètre
- **Rang column was blank** for the same reason — ranking only happens for élèves with a valid moyenneMatiere
- **PP cross-matière table cells** would show "—" too once you noticed (same data path)

### The fix

I changed the engine signature to accept the object form (matching all three call sites). Same logic, just the right shape. Now:

- Closure → real moyenne is computed and persisted
- Baromètre appears as soon as one matière is closed
- Rank column populates
- PP cross-matière table shows real numbers

This was a Phase 0 oversight that took until 4c-ii.1 to surface, because nothing tested the actual moyenne value in the saved doc until you noticed it was missing.

## Bug 2: "Recalculer" button doesn't make sense when fully closed

You're right — once a matière is fully clôturée, the Recalculer button just re-opened the same Layer A modal. Tapping Continuer would re-write the same data. No real recompute happens.

### The fix

When `allClosed === true`, the action area now hides the button entirely and shows a small italic hint:

> *Pour modifier, demandez au professeur principal de déverrouiller.*

This matches the locking philosophy:
- **Per-matière lock** (after prof's closure) → prof can't accidentally edit
- **PP unlock action** (in Bulletins mode) → the only way back to editing
- **Bulletin lock** (after PP generates) → separate concern

When some rows are closed but not all, the button still shows as "Compléter la clôture" — same as before. Only the all-closed state changes.

## On the ranks question (your other points)

In your screenshot you were on **mobile**, where the rank doesn't render as a column — it appears as a small line under the moyenne in the card header. With moyenne broken, there was nothing to rank against, so the rank line was empty too. With Bug 1 fixed, the rank line will appear.

If you want the rank also visible somewhere more prominent on mobile (e.g. as a separate stat tile), let me know — easy follow-up.

## On annual moyenne

Not in this patch. That's **Phase 4c-iii** (next substantive phase). It will:

- Add an "Annuelle" sub-tab inside PP Bulletins mode (only visible when ALL periods of the year have generated bulletins for that class)
- Compute `moyenneAnnuelle` per élève using the standard Bénin formulas:
  - Trimestre 3 periods: `(T1 + T2 + T3*2) / 4` (or whatever is configured)
  - Semestre 2 periods: `(S1 + S2*2) / 3`
- Compute `statutAnnuel: 'Admis' | 'Échoué'` (≥ 10)
- Compute annual ranking
- Write a per-élève annual bulletin doc
- **Feed the Transition élèves modal** we built in Phase 3d-iii — instead of admin manually classifying everyone, this would pre-populate Admis/Échoué decisions

With precautions: every period must be locked, every élève must have a per-period bulletin, the formula is configurable in BulletinConfig (some schools weight differently), and PP-only confirm with a hard "you cannot undo without admin" warning.

## Apply on Termux

```bash
cd ~/RT-SC && unzip -o ~/storage/downloads/RT-SC-phase4c-ii.2.zip
```

Vite hot-reloads.

## What to test

1. **Open an unclôturée matière** for a class with a few élèves
2. Enter notes (interros + at least one devoir for some élèves)
3. Notice the moyenne column updates **live** as you type — should now show real numbers (e.g. 14.50), not "—"
4. Run **Calculer & Clôturer** → resolve any non-Complet élèves
5. After closure:
   - **Baromètre card** appears above the table with the class moyenne, thermometer, and stat tiles
   - **Rang column** (desktop) or rank line under moyenne (mobile) populated for each closed élève
   - **No Recalculer button** — instead, the small hint about asking the PP
6. As **PP**: switch to Bulletins mode → cross-matière table cells show real numbers (not "—")
7. As **PP**: unlock the matière → goes back to editable; baromètre and ranks vanish

## What's NOT in this patch

- Annual finalization — Phase 4c-iii (next)
- Bulletin display + PDF — Phase 4d
- Backfill of broken data: any matière you closed BEFORE this patch has `moyenneMatiere: null` in Firestore. To fix: as PP, unlock those matières → as prof, run Calculer & Clôturer again. Future closures will be correct.

## Status

```
Phase 4c-ii.1  ✅ Per-matière rank + Baromètre
Phase 4c-ii.2  ✅ moyenneMatiere fix + Recalculer cleanup    ← we are here
Phase 4c-iii   ⏭  Annual finalization (moyenne annuelle, statut, annual ranking)
Phase 4d       ⏭  Bulletin display + PDF
```
