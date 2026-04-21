# Dismissible layer infra — back-button for dropdowns & sheets

## The problem

The overflow Plus menu (desktop dropdown + mobile bottom sheet) shipped
in the Phase 6e nav redesign didn't respect the Android back button.
Tapping back exited the app instead of just closing the menu.

The Modal component already had a full back-button + Escape handling
system — but it was private to Modal. Lightweight popups (dropdowns,
sheets) couldn't share it without bringing along Modal's full ceremony
(portal, focus trap, body scroll lock).

## The fix

Extracted Modal's stack management into two files both Modal and
any lightweight popup can reuse:

**1. `src/components/ui/dismissibleStack.ts`**
The shared LIFO stack + global Escape/popstate listeners. Exported
constants + functions. Same invariants as the old Modal-internal stack:
- Only the topmost entry responds to Escape / popstate
- 400ms dead zone after open (absorbs Android layout-transition
  popstate events)
- We NEVER call `history.back()` ourselves (compounds badly with
  React StrictMode + React Router + third-party listeners)
- If a layer closes via X/scrim/Escape, its synthetic history state
  lingers harmlessly; the next back tap pops the orphan, which —
  if there's another dismissible above us on the stack — closes that
  one too. Empty stack = silent no-op.

**2. `src/components/ui/useDismissibleLayer.ts`**
A minimal hook for lightweight popups:

```ts
const [open, setOpen] = useState(false)
useDismissibleLayer({ open, onClose: () => setOpen(false) })
```

On open: pushes a synthetic history state + registers into the stack.
On close/unmount: removes itself from the stack.

That's it. No portal, no focus trap, no scroll lock. The hook does
ONE thing: integrate with the back button / Escape system.

## Wired popups

These now close on back/Escape instead of escaping out:

1. **Overflow Plus dropdown** (desktop, under tab bar)
2. **Overflow Plus sheet** (mobile, slides from bottom)
3. **User dropdown in the header** (avatar menu with Se déconnecter)
4. **ExportMenu** (CSV/PDF export dropdown on bilans)

## Not wired (intentional)

These are collapsibles (accordions), NOT popups — tapping back
shouldn't collapse them:

- `VaultPanel` (élève codes coffre section)
- `SettingsInscriptionCard` (expandable config section)
- `RendezVousView` internal expandable groups

Accordions expand + collapse based on user intent; they don't
overlay page content. Back button should navigate normally when
they're expanded.

## Modal unchanged externally

The Modal component's public API is identical. Internally it now
imports `dismissibleStack` + installs/uninstalls listeners via the
shared helpers instead of owning its own stack. All the subtle bits
are preserved:
- Latest-callback ref pattern for onClose
- 400ms dead zone on open
- Dead-letter synthetic state behavior
- Body scroll lock + focus restoration
- Nested modal stacking

## Why this architecture (and not a Context provider)

Considered wrapping everything in a `<DismissibleProvider>` and using
a context to register. Rejected because:

1. The stack is LIFO + global by nature. React context would
   force every register to trigger a render chain through every
   consumer — expensive when a single keystroke in an open modal
   flips state.
2. Module-level storage is simpler, has no hook-ordering concerns,
   and the consumers (Modal, useDismissibleLayer) are the ONLY
   touch points. Encapsulation is via the file boundary, not
   context.
3. No SSR concerns in this app (Firebase + Vite SPA).

## Files changed

**New:**
- `src/components/ui/dismissibleStack.ts` — shared stack
- `src/components/ui/useDismissibleLayer.ts` — reusable hook

**Modified:**
- `src/components/ui/Modal.tsx` — imports shared stack instead of
  owning its own. Behavior identical.
- `src/components/ui/ExportMenu.tsx` — registers dismissible
- `src/components/layout/DashboardLayout.tsx` — user dropdown +
  overflow dropdown + overflow sheet all register dismissible

## Test

1. Apply + refresh
2. **Desktop overflow dropdown**: admin dashboard at narrow width →
   click the Plus button → dropdown opens. Press Escape → closes.
   Reopen → click browser back button → closes (no navigation away).
3. **Mobile overflow sheet**: phone view → tap Plus at bottom right →
   sheet slides up → tap Android back → sheet closes (doesn't exit
   the page).
4. **User dropdown**: click your avatar in the header → dropdown opens
   with Se déconnecter → back button closes it.
5. **ExportMenu**: go to caissier Bilan → click Exporter → dropdown
   appears → back button closes it.
6. **Modal still works**: open any existing modal (élève detail,
   paiement, etc.) → verify Escape still closes it, back button
   still closes it, X still closes it. No regressions.
7. **Stacked**: open élève detail modal → click Assigner classes →
   nested assign modal opens. Back button → closes the ASSIGN modal
   only, leaving the detail modal intact. Back button again →
   closes the detail modal. Back button again → is a silent no-op
   (or navigates depending on stack state).

## Roadmap

- ✅ Phase 6e nav overflow + back-button respect (this ship)
- NEXT: Firebase SDK 11 upgrade (kills the Firestore assertion bugs
  at the source)
- 6f — SaaS kill switch + FedaPay
- 6g — Vendor command center
