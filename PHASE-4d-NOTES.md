# RT-SC · Phase 4d — Bulletin display (PP surface)

The first half of the bulletin-display work. PP can now click any élève with a generated bulletin and see the **polished, official-looking bulletin** rendered in a modal — both per-period bulletins and annual bulletins.

This is the layout that families will eventually print. Phase 4e will add élève and parent dashboards plus PDF export, but the visual design is locked in now so we can iterate on it before wiring everywhere.

## What's in this patch

| Area | Status |
|---|---|
| BulletinView component | New — shared, used by display + future PDF |
| BulletinView assembler | New — pure function, tightly-shaped data |
| useBulletinView hooks | New — period + annual variants |
| ModalBulletinDetail | New — modal wrapper (used by PP) |
| PP cross-matière table | "Bull. OK" badge → clickable "Voir" |
| PP annual table | élève name → clickable when annual exists |
| PDF button | Placeholder (Phase 4e) |

## The bulletin layout

Modeled on standard Béninois CEG/secondary-school bulletins. Top to bottom:

**Header**
- School name (large, navy, uppercase)
- City + devise (italic gold) on the left
- "République du Bénin" + "Année scolaire 2025-2026" on the right
- Title bar: icon + "Bulletin de notes" + period name

**Identity block** (light gray strip)
- Nom et prénoms · Classe (bolded)
- Date de naissance · Sexe

**For periode mode** — matières table:
- Navy-headed table: Matière, M.I., Dev1, Dev2, **Moy**, Coef, **Total**
- One row per matière, alternating soft gray
- Abandonné rows show "Élève absent (matière non comptabilisée)" inline
- Conduite line in info-blue with "(−Xh colle)" indicator if applicable
- Gold-tinted footer row: Totaux + moyenne générale (color-coded ≥10 vs <10) + total points
- Three verdict tiles below: Moyenne / Rang / Mention

**For annuelle mode** — period summary table:
- Navy-headed: Période, Moy. générale, Rang, Mention
- One row per period
- Gold-tinted footer: "Année" with formula notation underneath ("Formule standard : (S1 + S2×2) / 3"), annual moyenne, annual rang, annual mention
- Big centered statut badge: "ADMIS EN CLASSE SUPÉRIEURE" (success) or "ÉCHOUÉ" (danger)

**Footer**
- Three signature blocks: Le/La PP · Le Censeur · Les parents
- "Bulletin émis le [date]" italic centered
- For annuelle + verrouillé: "Document officiel"

## Mention scale

| Moyenne | Mention |
|---|---|
| ≥ 16 | Excellent |
| ≥ 14 | Très bien |
| ≥ 12 | Bien |
| ≥ 10 | Passable |
| < 10 | Insuffisant |

Standard French/Béninois grading. Could be made configurable later.

## Architecture notes

The display is split into three layers for testability and PDF reuse:

1. **`lib/bulletinView.ts`** — pure assembler. Takes raw docs (Bulletin, Notes, Coefficients, Eleve, Classe, BulletinConfig, EcoleConfig) and returns a tightly-shaped `BulletinPeriodView` or `BulletinAnnualView`. Zero React, zero Firestore. Easy to unit-test in isolation.

2. **`hooks/useBulletinView.ts`** — `usePeriodBulletinView` and `useAnnualBulletinView`. TanStack Query hooks that fetch the raw docs, then call the assembler. 5-min stale, conditional on having a class+élève selected.

3. **`routes/_shared/bulletins/BulletinView.tsx`** — the React component. Pure render from a `BulletinPeriodView | BulletinAnnualView`. The same component will feed the PDF generator (Phase 4e), so both surfaces always show identical data.

This separation means: when Phase 4e adds PDF export, it's just "feed the same view shape to a PDF renderer". No data fetching duplicated.

## How PP opens a bulletin

**Per-period (PeriodeMode):**
- Cross-matière table now has a clickable "Voir" pill in the Bull. column for every élève with a generated bulletin
- Click → `ModalBulletinDetail` opens with `mode="periode"` and the current period
- Loading state: spinner. Missing bulletin: empty state explaining PP must generate first.

**Annual (AnnualMode):**
- The élève's name in the annual table becomes a clickable link (gold underline on hover) when their `statutAnnuel` is set
- Click → `ModalBulletinDetail` opens with `mode="annuelle"`
- Same loading + empty state behavior

The "Télécharger PDF" button is rendered but disabled with title "Disponible bientôt" — Phase 4e wires it to actual jsPDF generation.

## Apply on Termux

```bash
cd ~/RT-SC && unzip -o ~/storage/downloads/RT-SC-phase4d.zip
```

No `npm install` needed.

## What to test

You'll need a class with at least one period bulletin generated, and ideally annual closure done too:

1. As **PP** → Bulletins → Période → cross-matière table
2. Find an élève with the green "Voir" badge in the Bull. column → tap it
3. Modal opens with the polished bulletin layout
4. Verify:
   - School name + ville + devise in header (header data comes from your école config in Firestore — `nom`, `ville`, `devise` fields)
   - Identity block with élève name, classe, DOB, gender
   - Matières table with all your matières + their notes + coef + total
   - Conduite line with the −Xh indicator if any colle hours
   - Gold footer with moyenne générale, totaux
   - Three verdict tiles (Moyenne, Rang, Mention)
   - Three signature blocks at the bottom
5. Switch to **Annuelle** sub-mode (if you've done annual closure)
6. élève names with statutAnnuel set should be **gold-underlined on hover** → click one
7. Modal opens with annual bulletin: per-period rows, gold "Année" footer with formula, big centered "ADMIS" or "ÉCHOUÉ" badge
8. **Télécharger PDF** button is visible but disabled — that's Phase 4e

## What's NOT in this patch (Phase 4e)

- Élève dashboard (élève sees their own bulletins)
- Parent dashboard (parent sees their child's bulletins)
- PDF export (the button is a placeholder)
- "PDF en lot" — PP downloads all class bulletins as a ZIP
- Print stylesheet (works for now via browser Print, but not yet optimized for paper)

## Status

```
Phase 4d       ✅ Bulletin display (PP surface)              ← we are here
Phase 4e       ⏭  Élève + Parent dashboards + PDF export
```
