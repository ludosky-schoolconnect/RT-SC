# RT-SC · Phase 4e.4 — Accueil rework + zoom defense

You raised three things, all fair. Addressing each.

## 1. Why does the page zoom?

Your `index.html` viewport meta tag is correct (`maximum-scale=1.0, user-scalable=no, viewport-fit=cover`). On Android Chrome, this is normally enough to disable pinch-zoom AND auto-zoom.

But two things can still trigger zoom regardless:

**a)** Android's accessibility setting "Force enable zoom" overrides the viewport tag. This is system-level — most devices ship with it ON for accessibility. There is no app-level fix and no app SHOULD try to fight it (it's an accessibility feature). If you pinched accidentally, that's why it zoomed.

**b)** Double-tap-zoom, which is separate from pinch-zoom. Chrome will zoom in when you tap rapidly twice on any element. This patch adds `touch-action: manipulation` to the body globally, which tells Chrome "don't double-tap-zoom anywhere in this app." Buttons already had this rule; now everything does.

So after this patch:
- **Accidental double-tap on a card → no zoom** ✓
- **Genuine pinch with two fingers → still zooms** (system accessibility)
- **Auto-zoom when focusing inputs → already prevented** (all inputs are 16px)

If you're still getting zoomed by single-finger gestures after this patch, it's a device-specific behavior I can't override from the app.

## 2 + 3. The Accueil architecture problem (the real one)

You wrote: *"where will all the stuff like profile picture, English hub, scolarité status, heure de colle aperçu, etc. like in the original version will stay? Did you take them into account for later? Since they should stay in acceuil and the accès rapide will be meaningless since there are navigation tabs already there"*

You're 100% right. The 2x2 quick-action tile grid I built was **placeholder filler** because the only domain with real data was Bulletins. The tiles ARE redundant with the bottom navigation — they shortcut to other tabs the user can already see at the bottom of their screen.

I confirmed by reading the legacy app you uploaded that the original élève accueil hosted:
- **English Hub** — gradient blue card with daily word, definition, example, quiz, streak counter
- **Heures de Colle** — red-bordered widget showing cumulative count
- **Annonces preview** — 3 most recent announcements
- Profile picture + scolarité status

These are real persistent widgets, not navigation shortcuts. As we ship Phase 5+ modules (absences, schedule, annonces, etc.), each adds its widget to Accueil.

### The reframe

**The new Accueil shows:**

1. **Greeting strip** (already there)
2. **Featured bulletin card** (the real, live widget — same gold-tinted hero design)
3. **À venir** preview section with three ghosted-but-styled placeholder widgets:
   - 🔴 Heures de colle — `— h` faded
   - 🇬🇧 English Hub — with the flag as a rotated decorative watermark
   - 📣 Annonces récentes

Each preview widget has:
- The actual icon and color tone the live widget will use (red for colle, navy/blue for English, warning amber for annonces)
- A "🔒 Bientôt" badge so it's clearly not active yet
- 75% opacity to recede visually
- The styling SHAPE the live version will have, so users see what's coming

**Removed entirely:**
- The 2x2 "Accès rapides" tile grid. Bottom nav already does that job.
- The "Plus" tile (literally a duplicate of bottom-nav Plus tab).

### Why preview widgets instead of nothing

Three reasons:
1. **Page doesn't feel hollow** — without the tile grid, removing it would leave an empty page below the featured card
2. **Sets expectations** — users see "ah, English Hub is coming back" instead of being surprised when it appears later
3. **Layout anchored** — when the live widgets ship, they slot into the same positions, no jarring layout shift

As Phase 5+ ships each widget, we replace its preview entry with the live one. The doc comment at the top of `AccueilTab.tsx` documents this transition explicitly so the next person (or future me) knows what to do.

### What the legacy English Hub did

For the record, when we ship the English Hub widget in Phase 5+, it should match the legacy:
- Gradient navy → blue background
- Word of the Day (large yellow-amber)
- Definition + italic example
- Daily quiz (4 buttons)
- Streak counter top-right ("🔥 3 Days")
- Already-answered-today state shows a green "Awesome job!"
- Streak data on `eleve.englishStreak`, last quiz date on `eleve.lastEnglishQuiz`
- Quiz content sourced from a hardcoded `englishDatabase` array

Heures de colle widget should match:
- Red-tinted card with alarm-circle icon
- Big number on the right
- Reads from `colles` subcollection, sums `heures` field

Annonces preview:
- 3 most recent from `annonces` collection scoped to the élève's classe + global
- Click → navigates to full Annonces tab

These will get their own phases as we get there.

## Apply on Termux

```bash
cd ~/RT-SC && unzip -o ~/storage/downloads/RT-SC-phase4e.4.zip
```

No `npm install`. Vite hot-reloads.

## What to test

1. **Double-tap-zoom is gone**: try double-tapping rapidly on any card or button → page should NOT zoom in
2. **Pinch-zoom still works** if you really want it (system accessibility)
3. **New Accueil layout**: greeting → featured bulletin → "À venir" section with 3 preview widgets (Heures de colle, English Hub, Annonces). No more Accès rapides tile grid.
4. **Visual styling** of preview widgets feels coherent — not just placeholder rectangles, but actually styled to look like the live versions will

If anything feels off — especially the preview-widget styling, since that's the design preview of multiple future modules — tell me and we adjust before they go live.

## Status

```
Phase 4e.4     ✅ Accueil rework + zoom defense    ← we are here
Phase 4e.1     ⏭ PDF en lot + multi-child parent
Phase 5        ⏭ Daily ops (emploi du temps, absences, appel, colles)
```
