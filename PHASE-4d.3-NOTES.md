# RT-SC · Phase 4d.3 — Bulletin display crash fix (the actual fix)

The diagnostic patch (4d.2) worked: your screenshot showed the exact error message — `Cannot read properties of undefined (reading 'length')`. With that, I was able to identify and fix the underlying issue.

## What was happening

**The cause: stale TanStack Query cache.**

The Phase 4d patch shipped a `BulletinView` component that read `row.interros.length`. The 4d.1 patch tightened the format. Both patches assumed `row.interros` was always an array (which the assembler ensures).

But TanStack Query caches successful query results in memory with `staleTime: FIVE_MIN`. So when Vite hot-reloaded after applying 4d.1, the **cached** view shape from the original Phase 4d run was still in memory — and that older shape didn't have the `interros` field on each row (it was added in the same patch as the rendering, but the cache from the FIRST mount of the modal predated the field).

In short: cache from before, code from after, mismatch → undefined.

## The fix

Two parts:

1. **Defensive read** of `row.interros` with `?? []` fallback. So even if the cached data shape is missing the field, we don't crash. The rendering quietly degrades to "no interros line" instead of throwing.

2. **The ErrorBoundary safety nets stay** — wrapped around dashboard tabs and the BulletinView. They're not just diagnostic; they're real production protection against any other unforeseen render crash. White-screen-of-death is the worst possible UX, and a small error card is much better.

## Apply on Termux

```bash
cd ~/RT-SC && unzip -o ~/storage/downloads/RT-SC-phase4d.3.zip
```

After applying, **do a hard reload of the browser** (close the tab, reopen `localhost:5173`) to clear the old TanStack Query cache. Otherwise the cache still has stale data and the new defensive code just gracefully degrades — you wouldn't see the interros line. After hard reload, you'll see everything fresh.

## What to test

1. Hard-reload the browser tab
2. Re-open a bulletin via "Voir"
3. Should now render fully:
   - Polished header with school info
   - Identity block (name, classe, DOB, sex) — all visible cleanly
   - Matières table with M.I. + interros line (e.g. "12.50" with "15 · 10" below)
   - Conduite line
   - Gold-tinted totaux footer
   - Three verdict tiles (Moyenne, Rang, Mention)
   - Three signature blocks
4. **The Télécharger PDF button is still disabled** — that's Phase 4e

## Why this kind of bug is sneaky

TanStack Query is great for production performance (avoid refetching) but it means hot-reloading code while data is cached doesn't always Just Work. In real users' lives this isn't an issue — they don't hot-reload between code versions; they get a fresh cache on each page load. But for development iteration, occasional hard-reloads are needed when changing the SHAPE of cached data.

For future shape changes, I'll bump query keys so the cache invalidates automatically. Lesson learned.

## Status

```
Phase 4d.3     ✅ Bulletin crash fix      ← we are here
Phase 4e       ⏭  Élève + Parent dashboards + PDF export
```
