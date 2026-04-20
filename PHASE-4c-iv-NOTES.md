# RT-SC · Phase 4c-iv — Hotfix: Orphan coefficients on matière delete

Small focused patch for the bug you spotted in screenshot 2: matières you'd deleted in the admin space were still appearing in the PP cross-matière dashboard, hindering bulletin generation.

## The bug

When admin removed a matière (e.g. "EPS") via the matières editor, the code only updated the global `/ecole/matieres` doc. It did NOT touch the `/ecole/coefficients_*` docs. So if "EPS" had a coefficient set for niveau "3ème" before the deletion, that entry stayed in `/ecole/coefficients_3ème-null` as `EPS: 2`.

The PP cross-matière dashboard reads matières from each class's coefficient doc (it has to — coefficients are the source of truth for what counts in each class's bulletin). With orphan coefficients still present, "EPS" kept appearing as a column in the dashboard, and the preflight kept blocking bulletin generation with errors like "Caled : aucune note pour EPS".

## The fix

Two pieces:

### 1. Cascade on future deletes (the right behavior going forward)

New `useRemoveMatiere` mutation that does both writes atomically:
- Updates the global `/ecole/matieres` list
- Scans every `/ecole/coefficients_*` doc and removes the deleted matière's key

All in one Firestore batched write. The toast on success tells admin how many niveaux were cleaned up:
> « EPS » retirée. Coefficient nettoyé dans 3 niveaux.

The confirm dialog also explains the cascade upfront:
> « EPS » sera retirée de la liste des matières AINSI que de tous les coefficients déjà définis. Les notes déjà saisies pour cette matière restent dans la base mais n'apparaîtront plus dans les bulletins. Si vous re-ajoutez « EPS » plus tard, vous devrez redéfinir ses coefficients par niveau.

### 2. One-shot cleanup helper for your existing orphans

Since you already deleted matières via the old broken flow, you have orphan data right now. A new "Maintenance" disclosure section in the matières editor exposes a button:

> ✨ Nettoyer les coefficients orphelins

Tap it → confirm → it scans every coefficient doc and removes any key not in the current matières list (Conduite is always preserved). Toast tells you what was cleaned:
> 4 entrées retirées dans 2 niveaux.

Or if nothing's broken:
> Aucun orphelin trouvé. Tout est propre.

After running this once on your data, the PP dashboard should immediately stop showing the ghost matières.

## Why a Maintenance disclosure (collapsed by default)

The cleanup is a one-time recovery action. After you run it once, you'll never need it again (the cascade in #1 handles future deletes). Putting it behind a disclosure keeps the editor visually clean for everyday use, but accessible when you need it.

## Apply on Termux

```bash
cd ~/RT-SC && unzip -o ~/storage/downloads/RT-SC-phase4c-iv.zip
```

No `npm install` needed.

## What to test

1. **Run the cleanup once** to fix your current data:
   - As admin → Année tab → Matières enseignées → expand the "Maintenance" disclosure at the bottom → tap "Nettoyer les coefficients orphelins" → confirm
   - Toast tells you what was cleaned
2. **Verify in the PP view**:
   - Switch to prof account → Bulletins → Période → cross-matière table should no longer show the deleted matières
   - Préflight in "Générer les bulletins" should no longer block with errors about missing notes for those matières
3. **Test future deletes propagate correctly**:
   - As admin → add a temp matière (e.g. "TestMat") → save → set its coefficient for one niveau in the Coefficients editor
   - Then remove the matière from the matières editor → confirm
   - Toast should say "Coefficient nettoyé dans 1 niveau"
   - Verify in Firestore Console that the coefficient doc no longer has the TestMat key

## What's NOT in this patch

- **Cleanup of old notes** for removed matières — they stay in Firestore. They don't appear in any bulletin (no coefficient → engine skips them) but they're technically orphans too. Cleaning them would be a more invasive operation and probably not worth it (no functional impact, just storage)
- **Cascade to other places that might reference the matière** — for example, prof profiles that listed the matière as "taught". Currently if a prof had `matieres: ['Mathématiques', 'EPS']` and EPS is removed, the EPS entry stays in their profile. They just won't see EPS in their Saisie selectors. Not a bug, but could be cleaner. Defer.

## Status

```
Phase 4c-iii   ✅ Annual finalization
Phase 4c-iv    ✅ Orphan-coefficient hotfix      ← we are here
Phase 4d       ⏭  Bulletin display + PDF export
```
