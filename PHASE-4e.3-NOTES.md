# RT-SC · Phase 4e.3 — Modal hardening + élève/parent design refresh

Two things in this patch — the lingering modal flicker and the "everything looks glued" critique on the élève dashboard.

## 1. Modal first-tap flicker — final fix

You correctly noted: PIN modal is fixed (the Phase 4e.2 latest-callback fix nailed it), BUT the bulletin modal still flickers on first tap, both on élève side and on PP side after a fresh login.

Two new layers of defense added:

### a) `openedAtRef` initialized synchronously from `open` prop

Previously the ref was initialized to `0` and only stamped to `Date.now()` inside a `useEffect`. That effect runs AFTER the first paint. So when the modal mounts ALREADY open (a common pattern: `{state && <Modal open={true} />}` mounts AND opens at the same instant), there was a window where:

1. Modal mounts with overlay rendered, dead-zone ref still at 0
2. The lingering touch event from the open trigger arrives at the overlay
3. Dead-zone check: `Date.now() - 0` is HUGE, way over the 300ms window → no protection → onClose fires → modal closes

Fix: `useRef(open ? Date.now() : 0)`. Now initialization happens during the render itself, before any event can reach the overlay. The dead-zone is active from the very first paint.

### b) Dead-zone applied to popstate too

The popstate listener (which closes the modal when Android back button fires) had no dead-zone. On some mobile browsers, transient popstate events fire during overlay transitions. Same 400ms guard now applies there.

### c) Dead-zone bumped 300 → 400ms for slower devices.

### d) Refactored `BulletinsTab` to mount-and-flip pattern

Instead of `{openMode && <Modal open={true} />}` (which mounts and opens simultaneously), now uses `{openMode && <Modal open={bulletinOpen} />}` with separate state for the boolean. Cleaner AnimatePresence behavior, less reliance on the dead-zone alone.

Combined, this should kill the flicker for good — both first-tap and subsequent.

## 2. Design refresh — adding warmth and depth

Your critique: "All the stuff looks like they have been glued to the screen/background." Fair. Cards were flat white on flat gray with hairline borders — no depth, no place, no personal feeling.

### What changed

**Hero backdrop on Accueil**
- Soft navy gradient at the top of the page (info-bg → transparent) gives the greeting + featured card a "sky" to sit on instead of floating against gray.
- Large faded GraduationCap icon as a watermark in the top-right (~6% opacity navy) — adds character without distracting

**Featured bulletin card — properly hero**
- Layered shadows instead of flat hairline border: deep ambient shadow + tight contact shadow. Reads like a card sitting on a desk, not pasted onto the screen.
- Subtle gold ring around annual cards, navy ring around period cards.
- Top accent bar: 1px gradient strip across the top in gold or navy. Like the header band on a diploma.
- Background is a directional gradient, not a flat tint.
- Big moyenne in 2.5–2.75rem bold display font. The visual centerpiece, not buried.
- Bottom CTA divider with "Voir le détail →" in gold-dark for annual cards.

**Quick-action tiles**
- Same shadow + ring pattern as featured (lighter shadow, secondary tier)
- Hover lifts (shadow grows) + ring tightens to navy/25
- Disabled tiles (Bientôt) explicitly muted

**Bulletins tab cards (élève + parent)**
- Period cards: rounded-xl, layered shadow, ring, gradient icon block, larger moyenne, hover lift
- Annual hero card: rounded-2xl with deep shadow, gold accent bar at top, ring-1 gold, gradient backdrop, larger numerals

**Tailwind palette additions**
- New `ink-300`, `ink-500`, `ink-700` shades. Previously `text-ink-300`, `text-ink-500`, etc. were silently no-op'd by Tailwind (since the values weren't defined), so subtle dividers and placeholder text were just inheriting parent colors. This was a silent contributor to the "everything looks the same" feeling.

### Why this looks "earned" now

Original cards: 1px solid border + flat white fill + flat gray background. Three flat layers stacked. Eye sees: equal weights, no hierarchy, "cardboard cutouts."

New cards: layered shadow (creates depth) + gradient fill (creates warmth) + ring (subtle outline that doesn't compete with shadow) + accent stripe (signature element). Five layers of visual interest. Eye sees: real cards on a real surface.

## Apply on Termux

```bash
cd ~/RT-SC && unzip -o ~/storage/downloads/RT-SC-phase4e.3.zip
```

No `npm install`. Vite hot-reloads.

## What to test

### Modal flicker (the critical one)

1. Sign out completely, sign back in as an élève
2. On Accueil, tap the featured bulletin card → modal opens cleanly first time, no flicker
3. Tap "Mes bulletins" tile → switch to Bulletins tab → tap any bulletin card → modal opens cleanly first time
4. Sign out, sign in as PP → Bulletins → Période → tap "Voir" on first élève → no flicker

### Visual refresh

1. Élève Accueil: notice the soft navy gradient at the top, the faded GraduationCap watermark
2. Featured card has visible depth (shadow), gold accent stripe at top (for annual) or navy (for period), big bold moyenne
3. Quick-action tiles have proper shadow + lift on hover/tap
4. Bulletins tab: annual card is now properly heroic with gold tinted background and ring; period cards have depth and don't feel pasted

### Sanity check on parent side

1. Sign in as parent → same Accueil look, just with parentMode greeting

## Status

```
Phase 4e.3     ✅ Modal hardening + design refresh    ← we are here
Phase 4e.1     ⏭ PDF en lot + multi-child parent
Phase 5        ⏭ Daily ops (emploi du temps, absences, appel)
```

If the modal still flickers after this patch, I'd want to see a screen recording (or at minimum a more detailed description of when exactly it happens — which tap number, which surface). At this point I've thrown four layers of defense at it. If it still happens there's something specific about your Android Chrome version's touch event handling that needs targeted debugging.
