# RT-SC · Phase 4d.2 — ErrorBoundary + diagnostic wrap (blank screen fix)

You hit a white screen of death when clicking "Voir" on a bulletin. The issue is a render error somewhere in the BulletinView that's propagating up and unmounting the entire React tree.

I haven't been able to identify the exact cause from what I can see in the code — it would require seeing the actual console error. So this patch ships a diagnostic + safety net:

## What's in this patch

### 1. New `ErrorBoundary` component

A React error boundary class component that catches render errors in any subtree and shows a small error card instead of crashing the whole app. The actual error message is logged to `console.error` so you can read it and tell me what it says.

### 2. ErrorBoundary wrapping in two strategic places

- **Around the dashboard tab content** (in `DashboardLayout`) — if any tab's render crashes, you'll see a small error card in the main area but keep the header, nav, and ability to switch tabs
- **Around the BulletinView** specifically (in `ModalBulletinDetail`) — if the bulletin rendering crashes, you'll see the error inside the modal but the modal stays mounted

## Why I can't fix it directly

The render path from "click Voir" through to BulletinView mounting touches multiple components: ModalBulletinDetail, the two query hooks, the assembler function, and the BulletinView component itself. Most likely culprits in order of suspicion:

1. **A `.toFixed()` called on something that isn't a number** — e.g. `moyenneGenerale` ends up undefined for an old bulletin doc shape
2. **Missing field on the Bulletin doc** — Phase 4c-ii bulletins might not have a field that BulletinView assumes is present
3. **Something deeper** like a corrupted élève or note doc

Without seeing the console error I can't pin it down. Once you click "Voir" with this patch applied, you'll see the error message — please copy it back to me and I'll fix the actual bug.

## Apply on Termux

```bash
cd ~/RT-SC && unzip -o ~/storage/downloads/RT-SC-phase4d.2.zip
```

Vite hot-reloads.

## What to do after applying

1. Click "Voir" on a bulletin again
2. You should now see a red error card inside the modal instead of a blank screen
3. The card will display the error message itself (the `error.message`)
4. **Open Chrome DevTools console** (or however you read browser logs on Termux — `chrome://inspect` from desktop is the standard route)
5. Look for the line starting with `[BulletinView] caught:` — that's the actual error with the full stack trace
6. Send me a screenshot of either the error card OR the console log

With the actual error in hand I can fix the underlying bug in one shot.

## Status

```
Phase 4d.2     ⚠  Diagnostic patch — needs your console output
Phase 4e       ⏭  Élève + Parent dashboards + PDF export
```

This is a temporary safety net, not a real fix. Once we know what's broken, the next patch removes the need for the boundary and properly fixes the underlying issue.
