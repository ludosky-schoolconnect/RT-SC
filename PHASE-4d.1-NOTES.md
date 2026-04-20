# RT-SC · Phase 4d.1 — Bulletin layout fixes

Two layout issues you spotted on the bulletin display.

## Bug 1: Identity block layout was broken on mobile

The horizontal `label: value` rows worked on desktop but collapsed on narrow screens. With `flex` + `truncate` + `min-w-0`, a long label like "Date de naissance:" consumed most of the column width and the value was truncated to nothing — that's why "Caled" wasn't appearing next to "Nom et prénoms" in your screenshot.

### Fix

Stacked label-above-value layout. Labels are small caps gray, values are bold navy below. Same on desktop and mobile, no more truncation surprises.

Before (mobile, where this broke):
```
NOM ET PRÉNOMS:    CLASSE:
                   3ème M1
DATE DE NAISSANCE: SEXE:
                   Masculin
```

After:
```
NOM ET PRÉNOMS    CLASSE
Caled             3ème M1

DATE DE NAISSANCE  SEXE
2010-04-12         Masculin
```

Cleaner reading rhythm too — labels become quiet captions, values get the visual weight.

## Bug 2: Interros not shown

You correctly pointed out that hiding the individual interro values behind just an M.I. average is a loss for parents and élèves. They want to see the actual notes.

### Fix

The M.I. cell now shows the average up top (bolded, navy) with the raw interros listed below in small italic gray, separated by `·`:

```
M.I.
12.50
15 · 10
```

Compact for 1-3 interros (the common case), grows gracefully for the rare 5+ interro élève. Numbers are formatted as integers if whole (15) or 1 decimal if not (12.5).

The interros line only renders when there's at least one interro saved. Abandoned and empty rows show no interros line.

## Apply on Termux

```bash
cd ~/RT-SC && unzip -o ~/storage/downloads/RT-SC-phase4d.1.zip
```

Vite hot-reloads.

## What to test

Re-open any bulletin you tested before — you'll see:

1. **Identity block** now shows élève name, class, DOB, gender all visible (no more empty cells)
2. **Matières table M.I. column** shows the raw interros below the average

If your test élève had M.I. = 16.50 from interros [15, 18], the M.I. cell will now show:
```
16.50
15 · 18
```

## Status

```
Phase 4d.1     ✅ Identity block fix + interros visible    ← we are here
Phase 4e       ⏭  Élève + Parent dashboards + PDF export
```
