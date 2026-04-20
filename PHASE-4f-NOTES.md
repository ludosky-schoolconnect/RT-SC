# RT-SC · Phase 4f — Back-button overshoot fix

Tiny one-file patch. Modal back-button handling had a regression where closing a modal via the Android hardware back button could send the user one screen further back than expected.

## The bug

The Modal pushes a synthetic history entry on open and pops it on close, so the back gesture closes the modal instead of navigating away. Cleanup logic was:

```ts
if (pushedState && window.history.state?.rtScModal) {
  window.history.back()
}
```

Two ways a modal closes:

**(a) User taps X / scrim / Escape** — synthetic state still on history, we need to pop it. ✓ Worked.

**(b) User taps Android back button** — browser already pops the synthetic state, popstate fires, our listener calls onClose. Then cleanup runs. The check `window.history.state?.rtScModal` would be FALSE in most cases (we're now on the parent page's state)... UNLESS we were nested inside another modal that also pushed `rtScModal`. In that case `back()` fires again and pops the OUTER modal's state too — sending the user past where they were.

Even in single-modal cases, on some Android Chrome versions the timing of `window.history.state` updates after popstate isn't deterministic — sometimes the check returned true when it shouldn't, double-popping.

## The fix

Track explicitly whether close was triggered via popstate. If yes, don't call `history.back()` in cleanup — the browser already did that work.

```ts
const closedViaPopstateRef = { current: false }
const onPopState = () => {
  if (Date.now() - openedAtRef.current < 400) return
  closedViaPopstateRef.current = true   // ← mark before calling onClose
  onCloseRef.current()
}

// ...

return () => {
  // ...
  if (pushedState && !closedViaPopstateRef.current) {
    window.history.back()                // ← only when WE need to clean up
  }
}
```

No more guessing what the browser did. Two close-paths, two clear behaviors:
- Closed via X/scrim/Escape → `closedViaPopstateRef.current = false` → cleanup pops state ✓
- Closed via back button → `closedViaPopstateRef.current = true` → cleanup leaves history alone ✓

## Apply on Termux

```bash
cd ~/RT-SC && unzip -o ~/storage/downloads/RT-SC-phase4f-backfix.zip
```

Vite hot-reloads.

## What to test

1. Open any modal (bulletin, colle, generation, etc.)
2. Tap Android back button → modal closes, you stay on the same page (no extra navigation back)
3. Open a modal, close with X → still works, no broken history (back button on the parent page should still go where you'd expect)
4. Nested modals (e.g. confirmation modal inside another modal) → close inner with back → only inner closes, outer stays open

## Status

```
Phase 4f       ✅ Back-button overshoot fix              ← we are here
Phase 5a       ⏭ Annonces + parent space (next)
```
