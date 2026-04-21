# Firestore assertion auto-recovery

Two-layer defense against the "FIRESTORE (10.14.1) INTERNAL ASSERTION
FAILED: Unexpected state" error that appears randomly during app use.

## The underlying problem

Firebase Firestore 10.x has a documented regression where its internal
state machine sometimes desynchronizes and throws a generic assertion.
It's not caused by anything in your code — tracked in Firebase GitHub
issues #7496, #7937, #8250, and others.

Common triggers:
- Tab backgrounded and resumed (browser suspends the long-poll
  connection while Firestore thinks it's alive)
- Network flap (mobile data drops, reconnects → SDK retry logic has
  edge cases)
- Multiple concurrent onSnapshot listeners churning rapidly (react
  strict mode double-mount, fast navigation)
- Two tabs open at once (fight over IndexedDB persistence)

The SDK's own recommended recovery: reload the page (re-initializes
the client from scratch). That's what this patch automates.

## Layer 1: ErrorBoundary

When the assertion fires during a React render — e.g. a hook
synchronously calls into Firestore and it throws — the ErrorBoundary
catches it.

Detection: match `"FIRESTORE"` + `"INTERNAL ASSERTION FAILED"` in the
error message (flexible enough to match future SDK versions).

Behavior on match:
- Log a warning "auto-reloading the page in 800ms to recover"
- Show a calm blue "Reconnexion en cours…" card with a spinning icon
  (NOT the red error card)
- `window.location.reload()` fires 800ms later

Behavior on OTHER errors: the existing red error card now also has a
visible "Recharger" button so the user can recover without needing
to know where the browser's reload button lives.

## Layer 2: global window handlers

The assertion often fires from ASYNC code — inside an onSnapshot
callback, or a Promise chain from a mutation. Those throws happen
OUTSIDE React's render cycle and never reach an ErrorBoundary.

Two global listeners in `main.tsx`:

```ts
window.addEventListener('error', ...)              // sync errors
window.addEventListener('unhandledrejection', ...) // async rejections
```

Both check the same Firestore assertion signature. When matched, they
call the same `scheduleSoftReload()` helper.

## Reload loop guard

If the assertion fires IMMEDIATELY on page load (e.g. the bug is
triggered by something in the initial Firestore subscription chain),
naive auto-reload would loop forever. The guard uses sessionStorage:

- Record the reload timestamp when scheduling one
- On any subsequent assertion, check if we reloaded within the last
  10 seconds
- If so, SUPPRESS the auto-reload (log a warning, fall back to
  manual reload via the UI button)
- After 10 seconds, the guard expires so future genuine failures
  can still self-heal

This means: the user won't get stuck in a reload loop. If they do
see the red error card with the Recharger button, that's the
escape hatch.

## What the user experiences

**Before this patch**:
> Red error card: "Le contenu n'a pas pu s'afficher. Voir la console…"
> User has no idea what to do. Must hunt for browser reload button.

**After this patch**:
> Blue card appears for ~800ms: "Reconnexion en cours… La connexion
> à la base de données a été interrompue. La page se recharge
> automatiquement."
> Page reloads itself. Everything works again.

Invisible to most users. The few who notice will see a brief blue
flash instead of a confusing red error.

## Non-Firestore errors unchanged

This patch ONLY auto-reloads when the error matches the Firestore
signature. Other errors (real app bugs, render errors, missing
imports, etc.) still show the red error card with the error
message + console details + a visible "Recharger" button for
easy user recovery.

## Medium-term recommendation

Upgrade Firebase SDK to v11.x after Phase 6e. v11 fixed most of these
assertions at the source. The two-layer guard stays as belt-and-
suspenders even after upgrade, because no SDK is bug-free.

## Files changed

- `src/components/ui/ErrorBoundary.tsx` — Firestore detection +
  auto-reload branch, visible Recharger button in generic path
- `src/main.tsx` — global error + unhandledrejection listeners with
  reload-loop guard

## Testing

Hard to force the assertion manually (that's why it's annoying). You
can simulate it in the browser console:

```js
throw new Error('FIRESTORE (10.14.1) INTERNAL ASSERTION FAILED: Unexpected state')
```

From inside an async context:

```js
Promise.reject(new Error('FIRESTORE (10.14.1) INTERNAL ASSERTION FAILED: Unexpected state'))
```

Both should trigger the auto-reload within ~800ms.

A non-Firestore error should show the red card with the Recharger
button:

```js
throw new Error('some other error')
```
