# RT-SC · Phase 4e.2 — Modal robustness fix + warmer student/parent home

You raised four issues. I addressed all four. The Modal fix is the most important — it's a single root-cause fix for what looked like several different "modal flipping/closing" bugs across the app.

## 1. The Modal fix (THE big one)

**Symptoms across the app:**
- PIN code modal closing the second you start typing
- Bulletin modal flipping open-then-closed on first tap
- Other modals occasionally feeling "twitchy"

**Root cause** (singular): in `src/components/ui/Modal.tsx`, the main useEffect's dependency array included `onClose`, `disableEscClose`, and `trapBackButton`. Almost every parent component passes `onClose` as an inline arrow function:

```tsx
<Modal onClose={() => setOpen(false)} ... />
```

That arrow is a **fresh function reference every render**. So every time the parent re-renders — every keystroke in an input, every state update, every prop change anywhere — the Modal's effect torn down and re-ran. The cleanup function called `window.history.back()`, which fired our own `popstate` listener, which called `onClose`, which closed the modal.

In the PIN modal: typing in the input updates parent state → re-render → onClose ref changes → effect cleanup → history.back → popstate → onClose called → modal closes mid-typing. That's the entire bug.

In the bulletin modal: the open trigger's state update propagates → parent re-renders → same chain → modal flickers.

**The fix**: the **latest-callback ref pattern**.

```tsx
const onCloseRef = useRef(onClose)
const disableEscCloseRef = useRef(disableEscClose)
const trapBackButtonRef = useRef(trapBackButton)
useEffect(() => {
  onCloseRef.current = onClose
  disableEscCloseRef.current = disableEscClose
  trapBackButtonRef.current = trapBackButton
})

useEffect(() => {
  if (!open) return
  // ... handlers read from refs (e.g. onCloseRef.current()) ...
}, [open])  // <-- ONLY open. Critical.
```

The handlers always see the LATEST `onClose` because they read from `onCloseRef.current` at invocation time. But the effect itself only re-runs when `open` actually changes (true → false → true), not on every parent re-render.

**This fixes EVERY modal in the app at once.** No per-modal patches needed. The PIN modal, the bulletin modal, the closure modal, the annual closure modal, the generation modal — all of them benefit from this single change.

## 2. Élève dashboard now has a proper Accueil tab

You said "isn't the students space too plain looking?" and "since we have so many modules coming soon, should bulletin be the first tab? It looks weird."

Both fair. New structure for both élève AND parent:

- **Accueil** (default, first) — warm landing page
- **Bulletins** (second) — full bulletin list
- **Plus** (third) — placeholder for future modules

### What the Accueil shows

```
Bonjour, Julie 👋
3ème M1 · Année 2025-2026

┌─────────────────────────────────┐
│ ⭐ DERNIER BULLETIN ✨          │
│    Semestre 1                   │
│    14.67 / 20  · Rang 1ère/2    │
│    Voir le détail  →            │
└─────────────────────────────────┘

ACCÈS RAPIDES
┌─────────┐ ┌─────────┐
│ 📄      │ │ 📅      │
│ Mes bul.│ │ Emploi  │
│ 1 disp. │ │ Bientôt │
└─────────┘ └─────────┘
┌─────────┐ ┌─────────┐
│ 📣      │ │ ⋯       │
│ Annonces│ │ Plus    │
│ Bientôt │ │ Voir tt │
└─────────┘ └─────────┘
```

Three sections:

1. **Greeting strip** — "Bonjour, [Prénom] 👋" with class + année scolaire as subtitle. The 👋 emoji is the only one in the whole app; this is the personal touchpoint where it's appropriate.

2. **Featured bulletin card** — large gradient card showing the most recent bulletin (annual if exists, else last period). Big moyenne in 2xl bold, color-coded green/red. Gold-tinted if annual, navy-tinted if period. "Voir le détail →" affordance. Tap → opens the modal directly.

3. **Quick-action grid** — 2x2 tiles. Active tiles (Mes bulletins, Plus) navigate to the corresponding tab. Disabled tiles (Emploi du temps, Annonces) show "Bientôt" and are visually muted. As future modules ship in Phase 5+, they replace the disabled tiles.

### Parent variant

Same Accueil component, with `parentMode={true}`. Differences:
- Greeting changes to just "Bonjour 👋" (parent age, no first name)
- Subtitle shows "Espace parent · [child name]" instead of class
- Featured bulletin card is identical (parent sees their child's latest bulletin too)
- Quick actions are the same

## 3. The "module that takes care of all flipping/closing" you asked for

That's exactly what the Modal fix is. There's a single `<Modal>` primitive used by every modal in the app:

- ModalGenerateBulletins (PP generates per-period)
- ModalAnnualClosure (PP finalizes year)
- ModalBulletinDetail (anyone views a bulletin)
- The PIN entry modal in EleveLogin
- Plus various confirmation dialogs throughout

Fix the primitive once → fix them all. That's now done.

## What's NOT in this patch

- **PDF en lot** for PP (zip of all class bulletins) — still Phase 4e.1
- **Multi-child parent** support — still Phase 4e.1
- The "Emploi du temps" / "Annonces" tiles in Accueil are wired but disabled — they activate as their respective modules ship in Phase 5+

## Apply on Termux

```bash
cd ~/RT-SC && unzip -o ~/storage/downloads/RT-SC-phase4e.2.zip
```

No `npm install` needed.

## What to test

### The Modal fix (most important)

1. Sign out, then sign in as an élève via passkey
2. Type your full PIN code without it closing — that's the original bug, now fixed
3. While in the élève or parent dashboard, tap a bulletin card — modal opens cleanly first time, doesn't flicker
4. Same for PP: tap "Voir" on any élève — opens cleanly

### The new Accueil tab (élève + parent)

1. Sign in as an élève
2. Lands on **Accueil** by default, NOT Bulletins
3. See the warm greeting "Bonjour, [your first name] 👋"
4. The featured bulletin card shows your most recent bulletin (annual if exists, else last period)
5. Tap the featured card → bulletin modal opens directly
6. Tap "Mes bulletins" tile → switches to the Bulletins tab
7. Tap "Plus" tile → switches to the Plus tab
8. Tap the bottom-nav "Bulletins" icon → also switches to the Bulletins tab
9. Same flow as parent (sign in via parent passkey)

### Edge case: élève with no bulletins yet

If an élève has no bulletins at all, the featured card is replaced with a soft dashed-border placeholder ("Pas encore de bulletin") so the page doesn't look empty.

## Status

```
Phase 4e.2     ✅ Modal robustness + Accueil tab     ← we are here
Phase 4e.1     ⏭ PDF en lot + multi-child parent
Phase 5        ⏭ Daily ops (emploi du temps, absences, appel)
```

The Modal fix alone is worth its weight — every modal in the app is now genuinely solid, including all the future ones we'll add. The two-layer guard (target===currentTarget + 300ms dead-zone) plus the latest-callback ref pattern means we shouldn't see any more open-then-close flashes or stealth-closes-on-typing.
