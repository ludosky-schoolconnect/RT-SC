# RT-SC · Phase 3a — Admin Dashboard Shell + Classes Tab

This phase puts the admin dashboard online. You can finally **log in as admin and see a real working interface** instead of the Phase 0 placeholder.

## What's new

| Area | Status |
|---|---|
| `/admin` route | Real dashboard with adaptive navigation |
| Classes tab | **Fully functional** — create, edit, regenerate passkey, delete |
| Élèves / Profs / Année tabs | Placeholders labeled with their phase |
| Mobile bottom nav | New — adapts to screen size automatically |

## Adaptive navigation — how it works

Same dashboard, two presentations of the navigation:

- **Phone (< 768px wide)** → bottom nav bar with 4 icons + labels, fixed to the bottom, thumb-friendly. Sticky header at top shows just the school name and admin avatar.
- **Tablet & Desktop (≥ 768px)** → horizontal tabs at the top under the header (no bottom bar). Content gets full width.

Switching is pure CSS (Tailwind `md:` prefix) — same React component, same state, two layouts. Try rotating your phone or resizing a desktop browser window: the navigation morphs between presentations live.

## Active tab persists in URL

The active tab is in the URL as `?tab=classes`. If you refresh the page mid-work, you stay on the same tab. You can also share a link directly to a specific tab.

## Classes tab — the real thing

What you can do right now:

### Create a class
- Tap "Nouvelle classe" (top-right on desktop, FAB-like button)
- Choose cycle (Premier or Second)
- Pick the niveau (only valid options for that cycle appear)
- For second cycle: pick a série (A/B/C/D)
- Enter salle (M1, A, 1, etc.)
- Live preview at the bottom shows the final class name (e.g. "Tle D2")
- Submit — passkey is auto-generated, class appears instantly in the grid

### Edit a class
- Tap any class card
- Modify niveau, série, or salle
- "Enregistrer" button is disabled until you actually change something
- Save button is disabled while saving (no double-clicks)

### Regenerate passkey
- Inside the class detail modal → "Régénérer le code"
- Confirms before doing it (warning that old code stops working)
- Toast shows the new code on success

### Delete a class
- Inside the class detail modal → scroll to the red "Zone dangereuse"
- Confirms with a strong warning, including the élève count if non-zero
- **Cascading delete**: removes all élèves + their notes, colles, absences, bulletins, paiements, then the class itself
- Optimistic update — card vanishes from the grid immediately

### Filter & view
- Filter chips at the top: Tout / Premier cycle / Second cycle
- Stats strip: total classes, count per cycle
- Card grid: 1 column on phone, 2 on tablet, 3 on desktop
- Empty state with a clear CTA when no classes exist yet

## Live updates from other admins

The class list uses Firestore's `onSnapshot` — if another admin (or you on another device) creates a class, your screen updates automatically without refresh.

## What to test

After installing the patch and starting the dev server:

1. Log in as admin → land on the dashboard
2. **Rotate your phone landscape ↔ portrait** — watch the nav morph between top tabs and bottom nav
3. **Resize browser window** if testing on desktop — same morph at 768px
4. Tap "Nouvelle classe", create a 6ème M1
5. Try the same with a second cycle class to see série appear
6. Tap an existing card → edit, save
7. Try to delete a class with élèves to see the warning message
8. Switch tabs → Élèves / Profs / Année placeholders display the phase number that will deliver them

## Logout

Tap your avatar (top-right of header) → "Se déconnecter". Confirms before signing you out.

## What's NOT in Phase 3a yet

- Élèves tab (Phase 3b)
- Profs tab — pending approvals, assign classes, regen prof passkey (Phase 3c)
- Année tab — set anneeActive, school identity (nom/ville/devise editor), rollover (Phase 3d)
- À propos CMS editor (UID-gated, Phase 3d)

## Notes

- The active tab is URL-driven (`?tab=classes`). Refresh stays on same tab.
- Adaptive nav uses Tailwind `md:` prefix — purely CSS, no resize listeners.
- Classes use live snapshot subscriptions; mutations are optimistic with rollback.
- Élève counts use Firestore's `getCountFromServer` (1 read each) — won't slow down with school growth.
