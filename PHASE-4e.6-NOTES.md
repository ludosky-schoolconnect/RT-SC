# RT-SC · Phase 4e.6 — Heures de colle, end-to-end

You greenlit it. The colle module is now functional from prof entry to élève display.

## What this patch ships

**For profs (entry side):**
- Per-élève "Donner une colle" button on every row in the Saisie page (both desktop table and mobile cards)
- Modal to enter: hours (1/2/4/6 presets, or custom up to 24h) + optional motif
- Writes a Colle doc tagged with the current matière and période — automatically picked up by the bulletin engine

**For élèves and parents (display side):**
- Live "Heures de colle" widget on Accueil replacing the placeholder
- Per-period breakdown (each semester/trimester independent)
- Cumul total across the year
- Conduite point loss preview ("−2 pts" in warning amber)
- Clean "0h, continuez ainsi !" success state when no colles ever

**Plumbing:**
- New optional `motif` field on Colle docs — useful for prof reference, not shown in bulletins
- New `useDeleteColle` was already there; not surfaced yet (PP can manage colles in Phase 5)

## Architecture

The data flow that already existed:
```
prof writes Colle  →  Firestore /classes/{cid}/eleves/{eid}/colles/{auto}
                  →  bulletin engine reads via fetchAllCollesForClass
                  →  totalHeuresForPeriode(colles, periode) sums the relevant ones
                  →  noteConduite(baseConduite, totalHeuresColle) deducts points
                  →  Bulletin doc has totalHeuresColle field
                  →  BulletinView shows "(−Xh colle)" on the conduite line
```

This patch adds two new surfaces:

```
[ENTRY]    NotesGrid row → AlertOctagon button → ModalGiveColle
                                              → useAddColle.mutateAsync
                                              → onSnapshot pushes to TanStack cache
                                              → all live widgets update

[DISPLAY]  AccueilTab → HeuresColleWidget → useColles
                                          → totalHeuresForPeriode per période
                                          → grouped per-period rows
```

## Per-period independence

This is what you specifically asked about. The `Colle` doc has a `periode` field. The aggregator function:

```ts
totalHeuresForPeriode(colles, periode) =
  colles.filter(c => c.periode === periode)
        .reduce((sum, c) => sum + c.heures, 0)
```

Only colles tagged with the matching period count. So a colle issued during Semestre 1 affects ONLY Semestre 1's bulletin and ONLY Semestre 1's conduite calculation.

The widget reflects this: each period gets its own row showing its own count.

```
HEURES DE COLLE
Suivi par période · cumul 6h cette année

Semestre 1                   −1 pt   2 h
Semestre 2                   −2 pts  4 h
```

## The colle button design

Small AlertOctagon icon in the header of every élève row in Saisie. Tap → modal opens scoped to that élève + the current matière + period.

The button is always-visible (not hidden in a menu) because issuing a colle is something profs do regularly enough to warrant a quick action, and the icon is small enough that it doesn't compete with the note inputs visually. Hover/active state tints it red so it's visually associated with discipline.

Modal layout:
- Header: red AlertOctagon + élève name + matière · period
- Hours selector: 4 preset buttons (1/2/4/6) + "Autre" for custom
- Optional motif text input (max 120 chars)
- Impact preview ("chaque tranche de 2h retire 1 point...")
- Actions: Annuler / Enregistrer la colle

## The widget design

Two visual states:

**Clean state** (no colles ever): green ShieldCheck icon, "Aucune colle cette année. Continuez ainsi !"

**Has colles**: red AlertCircle icon header, then per-period rows with period name + point loss + hour count.

Loading state shows an animated skeleton so the page doesn't jump as data arrives.

## Apply on Termux

```bash
cd ~/RT-SC && unzip -o ~/storage/downloads/RT-SC-phase4e.6.zip
```

No `npm install`. Vite hot-reloads.

## What to test

### Prof entry side

1. Sign in as prof → Notes → pick a class + matière + period
2. On any élève row, tap the small AlertOctagon icon (next to the name, on the right)
3. Modal opens scoped to that élève. Pick "2h", optionally type a motif, tap "Enregistrer"
4. Toast confirms: "Colle de 2h enregistrée pour [élève] (Semestre 1)."
5. Add a few colles to the same élève across DIFFERENT periods (use the period selector to switch contexts)

### Élève display side

1. Sign in as the élève you gave colles to
2. Accueil → scroll to "Mon suivi" section
3. Heures de colle widget shows per-period breakdown matching what you entered
4. Tap "Bulletins" tab → open a bulletin from a period where you gave colles → conduite line shows "(−Xh colle)" and the conduite score is deducted
5. Open a bulletin from a period where you DID NOT give colles → no deduction. Per-period independence confirmed.

### Edge cases worth verifying

- Élève with zero colles → green clean state ("Aucune colle cette année")
- Two profs giving colles to same élève in same period → counts add up correctly
- Custom hours (e.g. "Autre" → 3h) → renders correctly
- Long motif (over 120 chars) → input maxLength prevents overflow

## What's NOT in this patch

- **PP colle management** (view all colles for a class, delete an erroneous entry) — needs admin/PP-only delete flow. Phase 5 adds a "Vie scolaire" surface where PP can manage absences + colles + appel.
- **Colle history view for élèves** (chronological list of all colles received with dates and motifs) — could be added under Plus tab later if useful.
- **Bulk colle operations** (select multiple élèves, give the same colle to all) — niche, deferred.

## Status

```
Phase 4e.6     ✅ Heures de colle end-to-end       ← we are here
Phase 4e.1     ⏭ PDF en lot + multi-child parent
Phase 5        ⏭ Daily ops (schedule, absences, appel, colle management)
```

Heures de colle joins the bulletin module as the second fully-functional vertical in RT-SC. The Accueil now has TWO live widgets, with English Hub and Annonces still as placeholders waiting for their phases.
