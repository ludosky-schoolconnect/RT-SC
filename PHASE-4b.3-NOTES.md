# RT-SC · Phase 4b.3 — Hotfix: oversized ✕ buttons in notes grid

Single-file CSS hotfix.

## What was wrong

In your screenshot, the red ✕ buttons for removing interros were the same size as the input cells — giant red discs covering everything. Same issue affected the dashed "+" button (it was rendering as a 44×44 block instead of the intended 32×32).

## Root cause

The global `base.css` has this rule:

```css
button {
  min-height: 44px;
  min-width: 44px;
}
```

That's a deliberate choice for primary touch-friendly buttons. But it overrides the small decorative ✕ corner badges I added (16×16) and the dashed "+" button (32×32). My component-level Tailwind classes lost the specificity battle.

## The fix

Added `!min-h-0 !min-w-0` (Tailwind important modifiers) plus `!h-4 !w-4` / `!h-8 !w-8` to the three affected buttons. The `!` translates to CSS `!important` which beats the global rule.

This is a surgical fix — I didn't touch the global rule because changing it could affect close-X buttons in modals, IconButton, etc. Those need to stay touch-friendly. Only badge-size overlays opt out.

## What you'll see after applying

- Tiny red ✕ in the top-right corner of each interro cell (only on hover for desktop, always visible on mobile)
- Dashed "+" button at a sensible 32×32 size, not 44×44
- The interros themselves are no longer covered

## Apply on Termux

```bash
cd ~/RT-SC && unzip -o ~/storage/downloads/RT-SC-phase4b.3.zip
```

Vite hot-reloads.

## Note on the privilege model

You raised a much bigger architectural point in the same message — that I conflated regular prof closure, PP period bulletin generation, and PP annual finalization into one "Calculer & Clôturer" button. That's correct, and I agree.

That work belongs in **Phase 4c**, properly split into:

- **4c-i**: Restructure Notes tab into Saisie / Bulletins modes; add PP role indicator; full Layer A intelligence in regular prof closure
- **4c-ii**: PP "Bulletins" cross-matière dashboard + period bulletin generation with Layer B intelligence
- **4c-iii**: Annual finalization (moyenneAnnuelle + statutAnnuel + ranking)

This hotfix gets you back to a usable UI immediately. Phase 4c-i is the next substantive ship.
