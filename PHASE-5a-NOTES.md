# RT-SC · Phase 5a — Parent space login + multi-child

The parent side of the app is no longer dormant. Parents can sign in with a code, link multiple children, switch between them, and view their bulletins. PPs get a per-class view of parent codes so they can distribute them when meeting families.

## What ships

### 1. Parent passkey login (`/auth/parent`)

Single-step flow. Parent types their child's passkey (`PRNT-XXXX-XXXX` — the `passkeyParent` that's been on every Eleve doc since Phase 2). We do a `collectionGroup` query across `eleves` for that passkey, find the élève, sign in anonymously, populate the parent session, redirect to `/parent`.

Format validation is strict: regex `/^PRNT-[A-Z0-9]{4}-[A-Z0-9]{4}$/`. Lower-case input is auto-upcased.

### 2. Multi-child support

`ParentSession` shape changed from single-child to:

```ts
interface ParentSession {
  children: ParentChild[]
  activeIndex: number    // which child is currently displayed
  uid: string            // anonymous Firebase uid (shared across all children)
}
```

When a parent is ALREADY logged in and enters another passkey, the new child is APPENDED to `children[]` instead of replacing. The same anonymous uid is reused.

Duplicate detection: if the same `{eleveId, classeId}` is already in the list, we show an error instead of re-adding.

### 3. Persistence

Parent session is persisted to localStorage under `sc_parent_session`. Trade-off: parents typically use personal devices, the passkey is the auth gate, and re-entering codes on every visit is friction. Élèves stay in-memory-only (school computers are shared).

Sanity check on load: we validate the shape (children array non-empty, activeIndex is a number). Old single-child sessions from the previous shape would fail the check and be discarded.

### 4. Child switcher (Accueil + Bulletins tabs)

When `children.length > 1`, a pill-style horizontal switcher appears above the Accueil and Bulletins content. Current child = navy filled pill. Other children = gray pills with classe name. Tap to switch. Switching updates `activeIndex` (persisted) and navigates to Accueil (so the greeting updates immediately).

### 5. Redesigned "Plus" tab

Full child management + account controls:

- **Mes enfants** — vertical list of all linked children. Each row shows initial avatar, name, classe, and "actif" badge for the currently displayed one. Tap row to switch. "Retirer" per row when >1 child. 
- **+ Ajouter un enfant** — dashed-border tile that routes back to `/auth/parent`, which detects the existing session and appends mode ("Ajouter un enfant" heading, "Ajouter l'enfant" button).
- **Compte** — "Se déconnecter" button (danger styled). Confirms first, mentions how many children will be forgotten.

Removing the last child is equivalent to logout.

### 6. Welcome page link updated

The "Espace parents" link on `/welcome` now points to `/auth/parent` instead of `/parent` directly.

### 7. PP-side codes view

In **Prof → Mes classes**, each class card now has a "Codes parents" action button (PP only, shown on the bottom-right of the card next to "Saisir des notes"). Tapping opens a modal listing all élèves of that class with their parent passkey.

Features:
- Search filter (by name)
- Copy-to-clipboard per passkey (monospace display)
- Read-only — regeneration stays in admin's hands via the existing VaultPanel
- Explanatory note at the bottom pointing to admin for regeneration

The card layout was refactored — whole-card `<Link>` wrapper replaced with an absolute-positioned overlay link, so child buttons (the new codes button) can coexist without swallowing events.

## Files touched

```
NEW  src/routes/auth/ParentLogin.tsx
NEW  src/routes/prof/tabs/classes/ModalParentCodes.tsx
MOD  src/types/roles.ts                                  (multi-child shape)
MOD  src/stores/auth.ts                                  (localStorage persistence)
MOD  src/App.tsx                                         (register route)
MOD  src/routes/welcome/WelcomePage.tsx                  (link update)
MOD  src/routes/parent/ParentApp.tsx                     (rewrite for multi-child)
MOD  src/routes/prof/tabs/classes/MesClassesTab.tsx      (codes button on card)
```

## Apply on Termux

```bash
cd ~/RT-SC && unzip -o ~/storage/downloads/RT-SC-phase5a-parentlogin.zip
```

No `npm install`. Vite hot-reloads.

## What to test

### Parent login flow
1. Admin dashboard → Élèves → pick an élève → copy the `PRNT-XXXX-XXXX` code
2. Open `/welcome` → "Espace parents" → code entry screen
3. Enter the code → should redirect to `/parent` with the child's Accueil + Bulletins
4. Invalid codes: empty, malformed (no PRNT- prefix, wrong length) → friendly inline error
5. Unknown code (correct format but doesn't match any élève) → "Code parent inconnu"

### Multi-child
1. Log in with child A's code → you're in parent space
2. Go to Plus → "+ Ajouter un enfant" → code entry appears in "Ajouter" mode
3. Enter child B's code → you're back in parent space, child B active
4. Pill switcher appears above Accueil → tap child A's pill → switches
5. Plus tab shows both children, "actif" badge on the current one
6. "Retirer" child A → confirmation modal → child A gone, child B remains active
7. Add child A back → should succeed, child A now at position 2

### Persistence
1. Close the browser tab, reopen `/parent` → session restored, same child active
2. `localStorage.getItem('sc_parent_session')` should show the array

### Logout
1. Plus → "Se déconnecter" → confirms
2. Redirects to `/welcome`, all children gone
3. Going back to `/parent` bounces to `/auth/parent`

### PP codes view
1. Log in as a prof who is PP of at least one class
2. Prof → Mes classes → your PP class card has a "Codes parents" button at the bottom right
3. Tap → modal with the élève list + passkeys
4. Copy a code → toast confirms
5. Search field filters by name
6. Tap the card itself (not the button) → still goes to Notes as before
7. On a non-PP class, the "Codes parents" button should NOT appear

### Edge cases
- Try the same code twice → "Cet enfant est déjà dans votre liste."
- Tamper with `localStorage` (bad shape) → cleanly falls back to no session
- Log in as élève on the same device, then as parent → both sessions coexist in the store but only the active one shows

## Known limitations (deferred)

- **No SMS verification** of parent phone. Anyone with the passkey can access. Acceptable for Béninois CEG context; consider Firebase Phone Auth upgrade later if schools want harder security.
- **No prof regeneration of codes**. Admin only (via VaultPanel). If a code is compromised, PP must ask admin to regenerate. Kept tight by design.
- **No link of multiple passkeys to the same "parent account"** across devices. Each device maintains its own list in localStorage independently. If a parent uses two devices, they enter codes on each. Acceptable — we don't have parent accounts (no email/phone registration), so there's no shared identity.

## On Phase 5b next

**Annonces module** comes next. The piece we'll build:
- Admin composer (title, body, scope: school OR classes[], priority, expiresAt)
- Live announcement widget on élève + parent Accueil (replaces the "Bientôt" placeholder)
- Modal with full body when an announcement is tapped

Once 5b ships, the Accueil widgets both light up (Heures de colle is already live, English Hub stays "Bientôt" until a dedicated phase).

## Status

```
Phase 5a       ✅ Parent space (login + multi-child + PP codes)  ← we are here
Phase 5b       ⏭ Annonces module
Phase 5c       ⏭ Emploi du temps
Phase 5d       ⏭ Absences + Appel
Phase 5e       ⏭ PP Vie scolaire (cross-prof colle mgmt)
Phase 6        ⏭ Inscription + Finances + admin polish
```

## Back-button update

4f.1 was shipped with the "never call history.back() ourselves" rule. Test this phase's new modals (ParentLogin has none, but ModalParentCodes uses the Modal component) and confirm X + Android back both close cleanly without overshooting.
