# RT-SC · Phase 5a.1 — Nested-modal back button fix + Parent Accueil

Two things in this patch, both responses to your feedback from 5a:

1. **Back button with nested/stacked modals** — audited and fixed.
2. **Parent Accueil** — rebuilt to be parent-facing, not élève-framed.

## Part 1 — Nested-modal handling

You asked me to verify the back-button/modal interaction handles stacking properly. I traced through it and found real bugs that the previous fix (never-call-history.back) didn't cover:

**Before this patch, with two stacked modals (B open on top of A):**

- Tapping Android back would fire popstate on `window` — and BOTH A's and B's listeners were attached to the window, so BOTH would fire, closing BOTH modals at once instead of only B.
- Same issue with Escape key.
- Same issue with overlay clicks implicitly (handled per-modal via target===currentTarget, so that one was actually safe).

After closing B via X, synth_B stayed on history (we never call back()). Now A is still open with its own synth_A still there. History: `[page, synth_A, synth_B]`. User taps back to close A:
- Browser pops synth_B first (the orphan) → nothing visually happens because B's listener was removed when B closed. **Dead back tap.**
- User taps back again → pops synth_A → A's listener fires → A closes. Finally.

**Fix: single global listener + stack.**

Module-level `modalStack: StackEntry[]` tracks open modals in LIFO order. ONE global `keydown` listener and ONE global `popstate` listener, installed on first modal's open, torn down when stack empties.

On Escape / back button → only the TOP entry's `close()` runs. Stacked modals unwind one-at-a-time:

- Modal A opens → stack: [A], synth_A pushed, history: [page, A]
- Modal B opens → stack: [A, B], synth_B pushed, history: [page, A, B]
- Tap back → browser pops synth_B → listener calls TOP.close = B.close → B closes → stack: [A]
- Tap back again → browser pops synth_A → listener calls TOP.close = A.close → A closes → stack: []

No more simultaneous close, no more dead taps when closing via back button.

For X-close path: B unmounts → stack pops B → synth_B lingers orphan. Now user taps back on A:
- Browser pops synth_B (orphan).
- Global listener sees stack TOP is A → calls A.close → A closes.
- Browser consumed the orphan, user sees A close on first tap. No dead tap.

Only edge case left: after ALL modals close via X, one orphan synth state lingers. First back tap after that is silent (no modal to close, URL unchanged), second tap actually navigates. Acceptable — it's the same trade-off 4f.1 already accepted, just doesn't compound with nested modals anymore.

## Part 2 — Parent Accueil (proper)

You were right that Phase 5a cheated by rendering the élève home with a `parentMode` flag. The legacy `parent-portal.html` has its own tabs (Bulletin, Absences, Paiement, Emploi, Annuaire). RT-SC should match that intent, not pretend the parent is the élève.

### New structure

`src/routes/_shared/accueilPrimitives.tsx` — NEW. Extracted `FeaturedBulletinCard`, `FirstBulletinPlaceholder`, and `PreviewWidget` from the old AccueilTab so both élève and parent tabs can share visuals. Added `'success'` and `'gold'` tones to PreviewWidget for the parent-only widgets (Paiement, Annuaire).

`src/routes/_shared/AccueilTab.tsx` — rewritten as élève-only. `parentMode` prop removed. Greeting is always "Bonjour, {firstName}". Widgets: Mon suivi (bulletin hero + colles) and À venir (English Hub + Annonces).

`src/routes/_shared/ParentAccueilTab.tsx` — NEW. Parent-facing structure:

- **HERO** — "Espace parent" kicker, "Bonjour 👋" title, subtitle "Voici le résumé de {firstName} · {classe} · Année {year}". Soft gold tint hero (vs élève's navy tint) to make the role context visually obvious.
- **Dernier bulletin** (live) — same FeaturedBulletinCard as élève, opens same bulletin modal.
- **Suivi scolaire** (live) — HeuresColleWidget.
- **Vie de l'école** (4 preview widgets) — Annonces, Absences+Retards, Emploi du temps, Paiement scolarité. Lit up as each module ships (5b, 5c, 5d, 6).
- **Communauté** (1 preview) — Annuaire des parents. The legacy had this as a parent-to-parent professional networking directory; we'll ship it in its own dedicated phase.

ParentApp imports `ParentAccueilTab` instead of the shared AccueilTab. Bulletins tab is still shared (read-only bulletin display works identically for parent and élève).

### Files touched

```
MOD  src/components/ui/Modal.tsx                     (nested-modal stack)
NEW  src/routes/_shared/accueilPrimitives.tsx        (shared visual primitives)
MOD  src/routes/_shared/AccueilTab.tsx               (élève-only now)
NEW  src/routes/_shared/ParentAccueilTab.tsx         (parent-specific)
MOD  src/routes/parent/ParentApp.tsx                 (use ParentAccueilTab)
```

## Apply on Termux

```bash
cd ~/RT-SC && unzip -o ~/storage/downloads/RT-SC-phase5a.1-nestedmodal-parentaccueil.zip
```

No `npm install`. Vite hot-reloads.

## What to test

### Modal stack
1. Open a bulletin modal (single modal baseline).
2. Tap Android back → modal closes, you stay on the page. ✓
3. Tap X → modal closes, you stay on the page. ✓
4. Inside a confirm modal (e.g. regenerate bulletins), a nested confirm should unwind correctly: inner first, outer second, each with one back tap.
5. The "everywhere that had the regression" — try the same X and back button across: bulletin detail modal, colle modal, generate bulletins modal, confirm modal, codes parents modal. All should close cleanly without overshooting.

### Parent Accueil
1. Sign in as parent with a passkey.
2. The Accueil tab now reads:
   - "Espace parent" gold kicker
   - "Bonjour 👋"
   - "Voici le résumé de {firstName} · {classe} · Année 2025-2026"
3. Scroll: Dernier bulletin (if any), Heures de colle, Vie de l'école preview widgets (Annonces, Absences, Emploi, Paiement), Communauté (Annuaire).
4. Parent-specific gold tint on the hero vs élève's navy tint.
5. Bulletin hero card still opens the bulletin modal when tapped.
6. Swap child (multi-child case) → Accueil updates to show that child's data.

### Élève Accueil should be unchanged
1. Sign in as élève.
2. Accueil says "Bonjour, {firstName} 👋" — nothing should look different from before this patch.

## Status

```
Phase 5a.1     ✅ Nested-modal fix + Parent Accueil       ← we are here
Phase 5b       ⏭ Annonces module (admin composer + Accueil widget)
Phase 5c       ⏭ Emploi du temps
Phase 5d       ⏭ Absences + Appel
Phase 5e       ⏭ PP Vie scolaire
Phase 6        ⏭ Inscription + Finances + admin polish
```

Each preview widget on the parent Accueil becomes "live" as the corresponding module lands. By the time Phase 6 ships, all five should be live (or dedicated to their own tabs).
