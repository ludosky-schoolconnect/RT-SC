# RT-SC · Phase 4e.1 — PDF en lot (impression de toute la classe)

PP can now generate ONE multi-page PDF containing every élève's bulletin for a class+period (or annual closure). Single click, single download, ready to print and distribute.

## Scope decision — multi-child parent deferred

You'll remember the original Phase 4e.1 scope was "PDF en lot + multi-child parent." When I dug into the parent space I realized the situation is different than I'd assumed:

**Parent login UI doesn't exist yet in RT-SC.** The `parentSession` Zustand state is consumed by `ParentApp.tsx` but never SET anywhere — there's no parent sign-in / code-redemption flow built. The space is essentially dormant; you'd have to manually populate the session in dev console to test it.

So "multi-child parent" isn't a closeout fix — it's part of building the parent login itself. That's a real feature with a real data model decision (parent has phone+PIN with a `children: []` array on the parent record), big enough to warrant its own phase.

So this Phase 4e.1 ships PDF en lot only. Parent login + multi-child becomes a separate "Phase 4e.7 — Parent space" later.

## What ships

### Period bulletins en lot

PP → Notes → Bulletins → Période. Once at least one bulletin is generated for the period, a new "Imprimer la classe" button appears next to the "Régénérer" button.

Tap → fetches all élève views in parallel → generates ONE multi-page PDF (one bulletin per page, page break between) → triggers download with filename like `Bulletins-3eme-M1-Semestre1.pdf`.

Élèves whose bulletin is missing for the period are silently skipped. So if 28 of 30 élèves have bulletins, you get 28 pages — which is what you want during partial corrections.

### Annual bulletins en lot

Same thing on the Annual sub-mode. Once at least one annual bulletin exists, "Imprimer la classe" appears next to the "Clôturer l'année" button. Filename: `Bulletins-3eme-M1-Annuel.pdf`.

## Architecture

The expensive part is fetching N élèves' worth of view data. Naive approach (call `usePeriodBulletinView` N times) wouldn't compose since hooks can't be looped. So I built dedicated async functions in `lib/pdf/batchBulletinFetch.ts`:

```
fetchAllPeriodBulletinViews({ classeId, eleves, periode, ecoleConfig, bulletinConfig })
  → fetchSharedContext (classe + coefficients) ONCE
  → Promise.all of fetchOneElevePeriodView (eleve + bulletin + notes per élève)
  → returns BulletinPeriodView[] in input order
```

Optimizations:
- **Shared docs fetched once**: `classe`, `coefficients`, `ecoleConfig`, `bulletinConfig`. For 30 élèves that saves 30× redundant reads each.
- **Per-élève reads parallelized**: 30 élèves × 3 reads (eleve, bulletin, notes) = 90 reads, but they all go out simultaneously via `Promise.all`. Total wall time is one round-trip, not 90.
- **Silent skip**: élèves without a bulletin doc → null → filtered out. Doesn't fail the whole batch.

For the PDF itself, `bulletinPdf.ts` got refactored:
- Extracted internal `drawBulletinOnDoc(doc, view, mode)` that renders ONE bulletin onto an existing jsPDF doc (no `new jsPDF` inside).
- Existing `generateBulletinPdf()` + `savePdf()` API unchanged — still works for single élève (used by ModalBulletinDetail's "Télécharger PDF" button).
- New `generateBulletinsBatchPdf(views, mode)` + `saveBatchPdf(views, mode, classeName)` for the batch path. Loops views, calls `addPage()` between, then outputs blob.

## Performance expectations

For a class of 30 élèves:
- Fetch phase: ~1–2 seconds (parallel reads, depends on network)
- PDF render phase: ~3–5 seconds (jsPDF is synchronous and CPU-bound; 30 bulletins × multiple draw calls each)
- Total: ~5–7 seconds before the download triggers

The button shows a loading spinner the whole time so PP knows it's working.

For very large classes (50+) we'd want to add a progress indicator and possibly chunk the rendering into `requestAnimationFrame` slices to keep the UI responsive. Not needed for the typical Béninois CEG class size (25–40).

## File size estimate

Each bulletin is ~30–60 KB of PDF (mostly the table layout + fonts). 30 élèves × ~45 KB avg ≈ 1.4 MB. Fits comfortably in browser memory and downloads instantly.

Annual bulletins are slightly larger (cross-period table) — closer to 60–80 KB each.

## Apply on Termux

```bash
cd ~/RT-SC && unzip -o ~/storage/downloads/RT-SC-phase4e.1-pdfbatch.zip
```

No `npm install`. Vite hot-reloads.

## What to test

### Period batch

1. Sign in as PP → Notes → Bulletins → Période
2. Pick a class + period that already has bulletins generated (you may need to generate them first)
3. New "Imprimer la classe" button appears next to "Régénérer"
4. Tap it → spinner for a few seconds → file download triggers
5. Open the PDF: should be one page per élève, alphabetical order, identical layout to the per-élève "Télécharger PDF"

### Annual batch

1. Same path, switch to Annuelle sub-mode
2. Class with at least one annual bulletin generated (clôture annuelle complete)
3. "Imprimer la classe" button appears next to "Clôturer l'année"
4. Tap → annual PDFs concatenated, filename ends in `-Annuel.pdf`

### Edge cases

- **No bulletins generated yet** → button is hidden (only shows when `generatedCount > 0` / `annualCount > 0`)
- **Partial generation** (some élèves missing) → PDF includes only the ones that exist, no error
- **Very small class** (1 élève) → PDF has 1 page, no errors
- **Single-élève PDF still works** → Open one bulletin in the modal, tap "Télécharger PDF" — same per-élève PDF as before, unchanged

### Sanity check on the per-élève PDF

The refactor extracted the draw logic into `drawBulletinOnDoc()`. To verify nothing broke:
1. Open any bulletin in the modal → "Télécharger PDF"
2. PDF should look identical to what you got before this patch — same header, same table, same footer

## Status

```
Phase 4e.1     ✅ PDF en lot                              ← we are here
Phase 4e.7     ⏭ Parent space (login + multi-child)
Phase 5        ⏭ Daily ops + PP Vie scolaire
```

Bulletin module is now genuinely closed out. PP can:
- Generate per-period bulletins ✓
- Generate annual bulletins ✓
- View any bulletin in the cross-matière table ✓
- Download a single bulletin as PDF ✓
- **Download an entire class as PDF in one click** ✓ (new)
- Unlock matières individually for note corrections ✓
- Delete bulletins to start over ✓

The whole Notes/Bulletins vertical is feature-complete from prof entry through PP closure through family-facing display through printable distribution.

After you verify, your call on direction:

- **Phase 4e.7** — parent space (login + multi-child). New auth flow + data model. Lights up the parent side of the app, which is currently dormant.
- **Phase 5** — daily ops bundle (schedule, absences, appel, PP Vie scolaire). Big phase, probably needs splitting into 5a/5b/5c. Lights up Annonces preview widget and adds the missing PP cross-prof colle management.
- **Phase polish/UI** — anything else that's been bugging you while testing.
