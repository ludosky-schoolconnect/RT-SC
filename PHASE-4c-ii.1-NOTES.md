# RT-SC · Phase 4c-ii.1 — Per-matière Rang + Baromètre

Small additive patch on top of Phase 4c-ii. Two visual upgrades to the prof's NotesGrid that surface the things you correctly called out as missing:

1. **Per-matière rank** — each élève's rank within the class for THAT matière in THAT period
2. **Baromètre card** — class health snapshot at the top of the closed grid

Both have been in `lib/bulletin.ts` since Phase 0 (`computeRanking`, `calculerBarometre`) but were never surfaced. Now they are.

## Per-matière rank vs per-period rank — the distinction

These are two different things, both useful, both shipped:

- **Per-matière rank** (Phase 4c-ii.1, this patch): "In Mathématiques for Trimestre 1, Marie is 5th out of 30." Visible to the prof in the NotesGrid.
- **Per-period rank** (Phase 4c-ii, already shipped): "Across all matières for Trimestre 1, Marie is 3rd out of 30." Stored on the Bulletin doc, computed by the PP during generation. Visible on the bulletin itself (Phase 4d).

The per-matière rank is purely a display computation from the closed notes — no schema change, no Firestore writes.

## Where the rank shows up

### Desktop table

A new "Rang" column appears at the right of the table (after Moy.), gold-tinted background. For each élève who has a closed non-abandoned moyenne, it shows their rank like:
- `1er/15` (premier)
- `1ère ex/15` (première ex aequo)
- `5ème/15`
- `—` if not enough data to rank

Tie-breaking follows the existing engine spec (equal moyennes share a rank with " ex" suffix, next rank skips correctly).

### Mobile cards

Below the moyenne in the card header, a small navy/70 rank line appears (e.g. "5ème/15"). Hidden when no rank is available.

### What counts as "rankable"

An élève is included in the ranking iff:
- Their saved Note doc has `estCloture: true`
- AND `abandonne: false`
- AND `moyenneMatiere` is a real number (not null/undefined/NaN)

So the ranking only shows what's been formally closed by the prof. As soon as the matière is closed, ranks appear. As soon as the matière is unlocked (PP action), ranks disappear (the closed flags went away).

## The baromètre

A new card renders above the NotesGrid table whenever at least one élève has a closed moyenne. Three sections:

### Header
Just the matière + period and a color-coded verdict pill: **Excellent** (green, ≥14), **Passable** (orange, ≥10), **Insuffisant** (red, <10).

### Big moyenne + thermometer
The class moyenne in big display font ("12.45 / 20") with a horizontal thermometer below. The thermometer is a 0-20 gradient (red → orange → green) with two reference lines at 10 and 14, and an animated marker showing where the class moyenne falls. The marker color matches the verdict.

A small note on the right shows the count of élèves contributing, plus how many were excluded as abandonné.

### Three stat tiles
- **Taux de réussite** — % of élèves with moyenne ≥ 10, color-coded (green ≥70%, orange ≥40%, red below)
- **Meilleur** — top moyenne with the élève's name (truncated)
- **Plus bas** — lowest moyenne, color depends on whether they passed (orange) or failed (red)

### What's excluded from the baromètre

Same rule as the rank: only closed, non-abandoned, real-number moyennes count. Abandoned élèves get a small italic note ("X absent(s) exclu(s)") so the prof knows the average isn't being dragged down by them.

## When to look at it

The baromètre updates live as profs close notes:
- Close one matière → baromètre appears (computed from the closed élèves so far)
- Open a closure modal mid-flow → still shows previous baromètre
- After full closure → baromètre stable, ranks complete
- After PP unlocks the matière → baromètre disappears (no closed data left)

## Apply on Termux

```bash
cd ~/RT-SC && unzip -o ~/storage/downloads/RT-SC-phase4c-ii.1.zip
```

No `npm install` needed.

## What to test

1. **Sign in as a prof** with a closed matière (you can re-close one if you've unlocked it via PP)
2. The grid should now show:
   - The **Baromètre card** at the top with the thermometer + stat tiles
   - The **Rang** column (desktop) or rank line (mobile) populated
3. **Verify the calculations**: pick a small class with known moyennes, confirm:
   - The class moyenne matches the average of all closed non-abandonné moyennes
   - The "Meilleur" name has the highest moyenne
   - The taux de réussite is correct
   - Ranks are dense (no gaps unless tied), with " ex" on ties
4. **Mark someone Abandonné** and confirm:
   - They're excluded from the moyenne classe
   - They don't appear in the rank order
   - The "X absent exclu" note shows up
5. **Unlock the matière** via PP → baromètre and ranks disappear (only "—" in the rank column)
6. **Re-close** → they reappear

## Edge cases handled

- **No closed élèves yet** → baromètre doesn't render at all
- **Only one closed élève** → still ranks (1er/1) and baromètre shows; meilleur === plus bas
- **Long élève names** in tiles → truncated to 14 chars with `…`
- **Moyenne === 0** → renders normally as 0.00 in red, contributes to average

## What's NOT in this patch

- Annual rank (across all periods) — Phase 4c-iii (annual finalization)
- Bulletin-displayed rank for élèves/parents — Phase 4d
- Rank trends across periods (e.g. "+3 places vs Trimestre 1") — Phase 4d
- Saving the per-matière rank to the Note doc — not needed; computed on demand from the existing data

## Status

```
Phase 4a       ✅ Foundations + admin editors
Phase 4b       ✅ Prof note entry
Phase 4b.1     ✅ Build fix + period dates
Phase 4b.2     ✅ Dynamic interros + NaN fix + closure guard
Phase 4b.3     ✅ Hotfix oversized buttons
Phase 4c-i     ✅ Layer A intelligence + role surfacing
Phase 4c-ii    ✅ PP cross-matière + Layer B + bulletin generation
Phase 4c-ii.1  ✅ Per-matière rank + Baromètre              ← we are here
Phase 4c-iii   ⏭  Annual finalization (moyenne annuelle, statut, annual rank)
Phase 4d       ⏭  Bulletin display + PDF export
```
