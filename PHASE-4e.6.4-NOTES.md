# RT-SC · Phase 4e.6.4 — Matière-clôture lock + delete colle + tighter validation

Three corrections from your testing. All real, all addressed.

## 1. Lock when matière is clôturé (the prof's commitment moment)

You wrote: *"isn't it risky? if they want to add colle after a closure, they should contact the PP instead. Or if they catch the student doing something weird after the clôturé, they can just give this colle to the second semester instead."*

You're right. The previous lock only fired when the bulletin was generated (a period-level event). But matière clôture is the prof's individual commitment moment for that period — saying "I'm done." Issuing a colle after that revisits a closed file silently.

### New rule

The colle modal now has TWO independent lock conditions, both blocking add AND delete:

1. **Matière clôturé** — `Note.estCloture = true` for this (élève × matière × période). The prof has clôturé THEIR matière, so they shouldn't issue more colles for that period.
2. **Bulletin généré** — `Bulletin` doc exists for this (élève × période). The PP has finalized the period.

When either is true, the LockedNotice replaces the form, and the existing colles list shows without delete buttons. The notice copy adapts:

**Matière-closure case:**
> Vous avez clôturé cette matière pour cette période. Les colles de cette période ne peuvent plus être ajoutées ni supprimées. Pour un incident postérieur à la clôture, donnez la colle pour la **période suivante**, ou contactez le professeur principal.

**Bulletin-generation case:**
> Le bulletin de cette période a déjà été généré. Pour ajouter ou supprimer une colle, le professeur principal doit d'abord supprimer les bulletins de la période (onglet Bulletins → Déverrouiller), puis les régénérer une fois les colles ajustées.

This nudges profs into the right behavior automatically — either give it to the next period (no procedural overhead) or escalate to PP. No silent drift either way.

### Why both add AND delete are blocked

If we only blocked adds, deleting an old colle would still shift the conduite. Same drift problem in reverse. So the rule has to be symmetric: any change to the colle set for a locked period is forbidden.

## 2. Delete colle button

You asked: *"is it possible to add a delete colle button so the prof can delete/cancel a given colle?"*

Yes. Every row in the "Déjà sur cette période" panel now has a small trash icon on the right. Tap → confirmation modal ("Supprimer cette colle ? Action irréversible.") → if confirmed, deletes via `useDeleteColle`. The list updates live (onSnapshot already wired).

Delete is disabled when either lock condition is true (per point #1 above). Loading spinner replaces the trash icon while delete is in-flight.

### Who can delete?

For now, anyone who has the modal open can delete (which means: any prof who teaches the matière in that class). PP/admin-only deletion across all matières is a Phase 5 "Vie scolaire" feature. The current model lets a prof correct their own mistakes, which is the most common case.

## 3. "Saved 3 but it became 2" — validation bug

You found a real bug. Sequence:
1. Default state: `heures = 2`, custom button not selected
2. Tap "Autre", custom field appears prefilled with "2"
3. Edit to "3"
4. The validator checked `heures` (still 2), reported "valid"
5. Submit button stayed enabled
6. Save → wrote 2, not 3

### Root cause

The custom-mode handler only updated `heures` when the typed value was valid:

```ts
function onCustomChange(v: string) {
  setCustomValue(v)
  const n = parseInt(v, 10)
  if (!isNaN(n) && n > 0 && n <= MAX_HEURES && n % 2 === 0) {
    setHeures(n)  // ← only when even
  }
}
```

When you typed "3", `customValue = "3"` but `heures` stayed at 2. The validator checked `heures` (the lagging state), so `isHeuresValid` was true, and submit accepted "2" as the value.

### Fix

In custom mode, the source of truth is the input string, not the lagging `heures` state. Two changes:

1. **`isHeuresValid` re-derives from `customValue`** when in custom mode:
   ```ts
   const isHeuresValid = customMode
     ? customValue.trim() !== '' && customParseError === null
     : heures > 0 && heures <= MAX_HEURES && heures % 2 === 0
   ```

2. **`heuresToSave` is derived**, not from `heures` state:
   ```ts
   const heuresToSave = customMode ? parseInt(customValue, 10) : heures
   ```

Submit writes `heuresToSave`, never the stale `heures`. The button is now correctly disabled while typing "3", with the inline error showing "Doit être un nombre pair." Tapping Enregistrer is a no-op until the value is even.

## Apply on Termux

```bash
cd ~/RT-SC && unzip -o ~/storage/downloads/RT-SC-phase4e.6.4-tightcolle.zip
```

Vite hot-reloads.

## What to test

### Matière-closure lock

1. Sign in as prof → Notes → pick a class + matière + period
2. Add a few notes, then clôture the matière (the green "Clôturé" banner appears)
3. Tap colle icon on any élève for that matière+period
4. Modal opens with: existing colles list (no trash icons) + LockedNotice explaining matière-closure + only "Fermer" button in footer
5. Switch period to one where matière isn't clôturé yet → form is back, delete buttons appear

### Delete colle

1. Open colle modal on an élève who has at least one colle for the period
2. Tap the trash icon next to a colle → confirm modal appears
3. Confirm → toast "Colle de Xh supprimée." → list updates to remove the row
4. The Heures de colle widget on Accueil (élève side) updates within seconds (live snapshot)

### Validation fix

1. Open colle modal, tap "Autre"
2. Type "3" → inline red error "Doit être un nombre pair (les colles sont par tranches de 2h)."
3. Submit button DISABLED (gray, not tappable)
4. Type "4" → error clears, button enables → save → toast says "4h" not "2h"

## Status

```
Phase 4e.6.4   ✅ Matière-clôture lock + delete + validation     ← we are here
Phase 4e.1     ⏭ PDF en lot + multi-child parent
Phase 5        ⏭ Daily ops + PP Vie scolaire (cross-prof colle mgmt)
```

The colle module is now genuinely lockdown-correct: profs commit per matière (matière clôture), PP commits per period (bulletin generation), both events freeze the colle state for the relevant period. No silent drift possible at either level.
