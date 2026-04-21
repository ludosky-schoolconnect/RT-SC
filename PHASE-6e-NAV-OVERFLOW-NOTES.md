# Nav bar — responsive overflow (Phase 6e)

## What changed

The tab bar no longer hardcodes "Plus" as a fixed tile. Instead, the
layout measures the available width on every render + resize and
decides how many tabs fit directly. Overflow collapses into a "Plus"
button whose dropdown lists the hidden tabs.

## The problem it fixes

Before: admin's tab bar always showed 5 tiles including "Plus", even
on a 1600px-wide desktop where all 8 destinations (Classes, Élèves,
Profs, Vie, Inscriptions, Emploi, Annonces, Année) would easily fit
directly. The Plus menu was visible AND largely empty because the
interior content had enough room to render everything inline.

After: on a wide desktop, all 8 tabs render directly. On a narrow
laptop or tablet, the tabs that don't fit automatically collapse
into Plus. Resize the window and the bar re-computes instantly.

## How it works

### Desktop (≥768px)

Two DOM layers:

**1. Hidden measurement layer**
All tabs rendered offscreen (position absolute, visibility hidden)
at their natural width. Lets us read each tab's `offsetWidth`
without affecting the visible layout.

**2. Visible layer**
Just the tabs that fit in the container's current `clientWidth`,
plus a Plus button if any overflow.

The `useOverflowTabs` hook computes `visibleCount` using a simple
greedy algorithm:

1. If all tabs' summed widths ≤ container width → everything fits, no Plus
2. Otherwise, find the largest N such that
   `sum(tab[0..N].width) + plusButton.width ≤ container.width`
3. Everything beyond N goes into the overflow bucket

A `ResizeObserver` on the container re-runs measurement on window
resize, sidebar toggle, or anything else that changes width.

### Mobile (<768px)

Phones don't benefit from measurement (tabs must be finger-sized,
so there's never meaningful "extra" room). We pick a fixed
`mobileDirectTabs` count (default 4) and push anything beyond that
into a Plus button. Tapping Plus opens a bottom sheet listing the
overflow tabs as big tap targets.

### Active state feedback

When the active tab is in the overflow bucket:
- Desktop: the Plus button shows the gold underline AND its label
  becomes the active overflow tab's label ("Plus" → "Inscriptions"
  when inscriptions is active). So the user always knows which
  surface they're on.
- Mobile: the Plus button gets the navy pill indicator and the
  label shows the active tab's label instead of "Plus".

## Call-site simplification

Before (AdminDashboard):
- Two hardcoded arrays (`TABS` with 5 items + `PLUS_ITEMS` with 4)
- A separate `PlusSurface` subcomponent with its own state machine
  (`plusSurface`, `setPlusSurface`) to track which sub-surface was
  selected from the Plus menu
- Duplication of icon/label/description metadata between the two arrays

After:
- ONE flat `TABS` array with all 8 destinations
- The `renderTab` switch handles all IDs directly
- No `PlusSurface`, no sub-state, no duplication
- Order in the array determines priority (earlier = always visible
  even when narrow; later = first to overflow)

## Call-site changes

### AdminDashboard
Completely rewritten as a flat list. All 8 destinations
(Classes/Élèves/Profs/Vie/Inscriptions/Emploi/Annonces/Année) are
peers. `PlusSurface` helper removed. Plus-menu specific `PlusMenuItem`
import dropped.

### ProfDashboard
Had a phantom `'plus'` tab that rendered `TabPlaceholder` when
clicked (no actual content). Removed.

## Call-sites NOT touched

`CaissierDashboard` already had a flat 3-tab array — no change needed.
EleveDashboard + ParentApp unchanged.

## Design choices

### Why measure on every resize?
Fonts load asynchronously (custom font swap changes widths). Tab
labels are dynamic in some contexts (role-aware). Container width
changes (sidebar toggle, browser zoom, window resize). Measuring
once at mount would leave the UI stale in any of those cases.

### Why not CSS container queries?
They can't count children. They can hide overflow with
`overflow: hidden` but we need to know WHICH tabs got hidden so we
can list them in the Plus menu.

### Why not CSS flex-wrap?
It would wrap tabs onto multiple lines — ugly, and the active
indicator (position absolute relative to row) would break.

### Why reserve Plus button width?
If 5 tabs fit exactly but 5+Plus wouldn't, greedy algorithm would
pick visibleCount=5 and never show Plus — leaving the last tab
clipped or pushed outside the container. Reserving plusButton.width
when measurement indicates overflow solves this cleanly.

### Why the 50ms initial delay?
Custom fonts finish loading a few ms after mount. Measuring
immediately risks capturing fallback-font widths which are usually
narrower. The delay + the `document.fonts.ready` listener together
ensure we measure against the actual rendered fonts.

## Files changed

- **New**: `src/components/layout/useOverflowTabs.ts` — measurement hook
- `src/components/layout/DashboardLayout.tsx` — overflow-aware nav
- `src/routes/admin/AdminDashboard.tsx` — flattened to 8-tab list
- `src/routes/prof/ProfDashboard.tsx` — phantom Plus tab removed

## Test

1. Apply + hard refresh
2. **Desktop wide (1400px+)**: admin dashboard should show all 8
   tabs directly in the header bar, NO Plus button visible
3. **Desktop narrow (~800px)**: drag the window to narrow it; some
   tabs should collapse into a Plus button at the right edge. The
   Plus button's dropdown should list whichever tabs overflowed.
4. **Mobile**: bottom nav shows first 4 tabs + Plus. Tap Plus → sheet
   slides up from bottom with the remaining 4 tabs.
5. **Active state**: click an overflow tab (e.g. Année). Plus button
   should now show "Année" as its label with the gold underline. The
   dropdown remains closed — your tab is active but the overflow
   menu doesn't auto-open.
6. **Navigation**: switching between overflow tabs works; tab state
   persists through page reload via the `?tab=` URL param.
7. **Prof dashboard**: no more phantom "Plus" tile when all 6 tabs
   fit; narrow screen → overflow works same as admin.

## What's NOT in this patch

- No route changes
- No new tabs
- No changes to tab CONTENT — only the bar that shows them
- No rule changes

## Roadmap

- ✅ Responsive nav overflow (this ship)
- NEXT: Firebase SDK 11 upgrade
- 6f — SaaS kill switch + FedaPay
- 6g — Vendor command center
