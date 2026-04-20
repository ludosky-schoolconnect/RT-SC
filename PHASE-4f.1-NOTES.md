# RT-SC · Phase 4f.1 — Modal back-button: never navigate ourselves

You confirmed the previous fix didn't work — closing a modal with X or back button still sent you back to login. Time for a more decisive fix.

## What I traced

I went deep on the diagnosis and couldn't reproduce reliably from code alone, but identified the most likely culprit: **React StrictMode in dev** runs every effect twice on mount. Each cycle pushes a synthetic state AND calls back() in cleanup. Combined with React Router's own popstate listener and possible interleaving, this can produce an unstable history where ONE close action triggers MULTIPLE pops — sending the user back through the entire authenticated session.

There are also other ways this can fail: third-party SDKs that listen to popstate, route guards that re-navigate when state shifts, etc. Anywhere we call history.back() ourselves becomes a potential overshoot vector.

## The new approach: NEVER call history.back() ourselves

The previous logic tried to "balance" the synthetic state push with a matching back() in cleanup. New rule: when the modal closes via X/scrim/Escape, **leave the synthetic state on history**. We never call back() ourselves.

The trade-off:
- **Closes via Android back button**: browser pops the synth state for us (natural). Modal closes cleanly. Zero overshoot.
- **Closes via X/scrim/Escape**: synth state lingers on history. The next time the user taps the page-level back button, the FIRST tap pops the orphan state (same URL, no visible change), the SECOND tap actually navigates.

Slight friction (one extra tap to leave a page if you closed modals via X), but **zero overshoot risk**. The trade is worth it — being sent to login mid-flow is dramatically worse than tapping back twice on the page.

## Code change

The cleanup no longer calls `history.back()`. Period. Just removes the listener.

```ts
return () => {
  // ... body style restore ...
  document.removeEventListener('keydown', onKeyDown)
  if (trapBackButtonRef.current) {
    window.removeEventListener('popstate', onPopState)
    // Deliberately do NOT call history.back() here. See the long
    // comment block above for rationale.
  }
  lastFocusedRef.current?.focus?.()
}
```

Single source of truth: the BROWSER decides when the synthetic state goes away. We never navigate on its behalf.

## Apply on Termux

```bash
cd ~/RT-SC && unzip -o ~/storage/downloads/RT-SC-phase4f.1-nobackcall.zip
```

Vite hot-reloads.

## What to test

1. Open any modal → tap X → modal closes, you stay on the same page (NOT sent to login)
2. Open any modal → tap Android back → modal closes, you stay on the same page
3. Tap page back button → goes back ONE step (might be a "no-op" first tap if you closed modals via X earlier; second tap leaves the page)

The "extra tap" friction is mild and only kicks in if you've been closing modals via X. For most user flows it's invisible.

## On the "remember the code PIN" note

Acknowledged. The student access code (and PP/admin visibility into per-class code list) goes into Phase 5a — Annonces + parent space. The parent uses the same code to log in to the parent space. It's already in scope; I'll surface the prof/admin views of these codes when we build the parent flow so PPs can hand them out.

## Status

```
Phase 4f.1     ✅ Modal back-button: never navigate ourselves   ← we are here
Phase 5a       ⏭ Annonces + parent space (next)
```
