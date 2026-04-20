# RT-SC · Phase 4e.5 — Modal viewport-stable lock + prof tab reorder

Two small focused changes from your last screenshots and feedback.

## 1. The bulletin-modal-zoom

You traced it precisely: it happens "when I click to see the details of the bulletin." So: tap "Voir le détail" → modal opens → page underneath visually zooms.

### Diagnosed cause

The Modal was using the naive body scroll lock:

```ts
document.body.style.overflow = 'hidden'
```

On Android Chrome, this can trigger a viewport rescale. Here's what happens:
1. Page is scrolled down some amount Y when you tap the bulletin card
2. `overflow: hidden` is applied to `<body>`
3. Body's content height collapses to viewport height (since overflow is hidden)
4. The browser's visual viewport (the part you see) is now SHORTER than what fits → Chrome auto-rescales to "fit" the new layout viewport
5. To you, this looks like the page zoomed in

Plus when the modal closes, the same "rescale + scroll snap to top" happens in reverse, often dropping you back at the top of the page even if you were scrolled deep.

### Fix

The robust mobile pattern: lock body via `position: fixed` while preserving scroll position. The modal effect now:

```ts
const originalScrollY = window.scrollY
document.body.style.position = 'fixed'
document.body.style.top = `-${originalScrollY}px`
document.body.style.left = '0'
document.body.style.right = '0'
document.body.style.width = '100%'
document.body.style.overflow = 'hidden'
```

On cleanup: restore all six properties AND `window.scrollTo(0, originalScrollY)` — so the page sits exactly where it was before the modal opened.

This is the same approach used by Material UI, Headless UI, Radix, etc. — they all converged on it because it's the only one that doesn't trigger Chrome's viewport rescale on Android.

After this:
- Bulletin modal opens → page underneath stays exactly as it was, no zoom, no scroll jump
- Modal closes → page returns to the same scroll position
- Same fix benefits every modal in the app (PIN entry, generation modal, annual closure modal, etc.)

## 2. Prof tab order: Mes classes first

You asked: "Should Mes classes come before Notes?"

Yes, you're right. Two reasons:

**Conceptual home.** "Mes classes" is the prof's roster — their identity in the app ("these are MY classes"). Notes is a task they perform on classes. Conceptually the home (the noun) should come before the action (the verb).

**Legacy precedent.** I checked the original SchoolConnect HTML — its order was: Mes classes → Élèves → Annonces → Emploi du temps. Notes was added later as an injected DOM extension, indicating it was an after-thought. The mental model was always "Mes classes is home."

New tab order: **Mes classes · Notes · Annonces · Plus**. Default tab also changed to `classes`.

This affects regular profs and PPs equally. PPs still have all the bulletin/closure tools inside Notes; nothing about the work changes, only the entry point.

## Apply on Termux

```bash
cd ~/RT-SC && unzip -o ~/storage/downloads/RT-SC-phase4e.5.zip
```

No `npm install`. Vite hot-reloads.

## What to test

1. **Open a bulletin from the élève dashboard**: scroll down a bit on Accueil first if you can, then tap "Voir le détail" → page underneath should NOT zoom, modal opens cleanly. Close → you're back at the same scroll position.
2. **Same test from PP side**: scroll into the cross-matière table, tap Voir → no zoom, no scroll jump.
3. **Sign in as a prof**: should now land on **Mes classes** first instead of **Notes**. Tab order in the bottom nav: Mes classes, Notes, Annonces, Plus.

## Status

```
Phase 4e.5     ✅ Modal viewport-stable + tab reorder    ← we are here
Phase 4e.1     ⏭ PDF en lot + multi-child parent
Phase 5        ⏭ Daily ops (schedule, absences, appel, colles)
```

If the zoom is genuinely gone, the bulletin module is locked. If it persists after this fix, it's almost certainly a system-level Android setting (force-enable-zoom in accessibility) and there's nothing app-level can do.
