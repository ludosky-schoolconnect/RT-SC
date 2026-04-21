# Phase 6d — Caissier role + dedicated dashboard

## What's live

### New role: `caissier`

`Professeur.role` now accepts `'admin' | 'prof' | 'caissier'`. A
caissier is staff member focused on financial + admission work.
They don't teach. They don't appear in class rosters. They have
their own dashboard at `/caissier`.

**Onboarding flow** (same as prof):
1. Candidate signs up via `/auth/prof` → creates their Firebase Auth
   account + a pending Professeur doc (statut=`'en_attente'`, role=`'prof'`)
2. Admin approves them in the Profs tab (statut → `'actif'`)
3. Admin promotes them: **Profs tab → tap the prof → Rôle section
   → "Caissier"**
4. The role change clears `classesIds` + `matieres` (caissier doesn't
   teach). It also removes them from each class's `professeursIds`
   array on the class side, for consistency.
5. Next login routes to `/caissier`

**Demotion back to prof**:
- Admin flips the role back to "Professeur" → arrays stay empty →
  admin reassigns classes + matières as needed.

**Self-demotion blocked**: admin can't change their OWN role (prevents
locking themselves out of admin access).

### Live role-change reroute (Option B)

If admin demotes an active caissier mid-session, the `AuthProvider`'s
onSnapshot listener on the prof doc picks up the change → `role`
in auth store updates → `ProtectedRoute` for /caissier detects the
mismatch → routes the user to their NEW role's landing page
(`/prof` or `/admin`) instead of dumping them at `/welcome`.

This works for any role transition. No manual logout required.

### Caissier dashboard — 3 tabs

At `/caissier` (lazy-loaded):

1. **Terminal** — name-override header card on top, then the existing
   Finances search+trier+paiement flow below. Name override is freeform
   text (e.g. "Marcel" or "Caisse 2"), persisted in `localStorage` under
   the key `sc_caissier_display_name`. Used for receipt rendering and
   paiement records.

2. **Bilan** — the existing BilanGlobalCard. Global + per-class scopes,
   full class roster table (sortable) in per-class scope, CSV/PDF export.
   Unchanged component, just lives in a new tab.

3. **Inscriptions** — the existing InscriptionsAdminTab, with its own
   internal Demandes / Rendez-vous / Guichet segmented control. Unchanged
   component.

### Name override

- Caissier types a preferred display name in the Terminal tab header
- That name stamps onto paiements + prints on receipts
- Stored per-device in localStorage (so a shared kiosk remembers who
  was on shift last, though each caissier is expected to update on
  login)
- Empty string = no override = falls back to the real Professeur name
- Cleared on logout (handled in `stores/auth.ts` `reset()`)

New helper `resolveCaissierName()` in `stores/caissier.ts` picks the
best name with this precedence:
1. Override (if non-empty)
2. profil.nom (the Professeur doc)
3. authUser.displayName
4. authUser.email
5. 'Administration' (last resort)

Callers that need the caissier name on a paiement or receipt use
this helper — no more inline chains of `??` fallbacks.

### Admin loses Finances + Inscriptions

The Plus menu on admin still exists (Emploi / Annonces / Année) but
Finances and Inscriptions tiles are REMOVED. Admin can't stamp
paiements or finalize inscriptions anymore — those are caissier-
exclusive flows.

Why: separation of duties. A single admin who both records
tuition AND audits the bilan has no oversight. Caissier does the
day-to-day; admin reviews (they can READ everything via bilan PDFs).

## Firestore rules — `isCaissier()` added

New helper:
```
function isCaissier() {
  return isStaff()
    && get(/databases/$(database)/documents/professeurs/$(request.auth.uid)).data.role == 'caissier';
}
```

Surgical permission splits:

- **Admin-only writes** (`isAdmin() || isSaaSMaster()`):
  - `/ecole/**` (school config, subscription)
  - `/system/**`
  - `/settings_inscription/**` (inscription config)
  - `/archive/**` + `/archived_absences/**` (rollover)
  - `/pre_inscriptions/{id}` delete
  - Paiement `delete` (correction only by admin)

- **Admin OR caissier** (NEW):
  - `/pre_inscriptions/{id}` update — approve/refuse/reprogram/finalize
  - `/classes/{cid}/eleves/{eid}` create — guichet finalize writes new élèves
  - `/classes/{cid}/eleves/{eid}/paiements/**` create/update — terminal de caisse

- **Admin + teacher (NOT caissier)** — everything else destructive:
  - `/classes/**` write
  - `/professeurs/**` update/delete
  - `/annonces/**`, `/emploisDuTemps/**`, `/seances/**`, `/annales/**`
  - Élève update/delete (only admin+prof — caissier creates, not edits)
  - Notes, bulletins, colles, absences
  - Vigilance IA

- **Parent reprogram** (unauth): unchanged — `dateRV` + `reprogCount`
  only, +1 increment enforcement.

**Full rules** are in `firestore-6d.rules` in the zip. Deploy them
via Firebase Console.

## Files changed

### New files
- `src/stores/caissier.ts` — Zustand store + resolveCaissierName
- `src/routes/caissier/CaissierDashboard.tsx` — the dashboard itself

### Type extensions
- `src/types/models.ts` — ProfesseurRole union now includes 'caissier'
- `src/types/roles.ts` — Role union now includes 'caissier'

### Routing
- `src/App.tsx` — `/caissier/*` route with ProtectedRoute wrapper
- `src/components/guards/ProtectedRoute.tsx` — smart role-change reroute
- `src/routes/auth/ProfAuth.tsx` — caissier login routes to /caissier

### Auth store
- `src/stores/auth.ts` — deriveRole handles caissier; reset() clears
  caissier LS key

### Admin dashboard
- `src/routes/admin/AdminDashboard.tsx` — Finances + Inscriptions
  removed from Plus menu

### Profs admin tab
- `src/hooks/useProfsMutations.ts` — new `useUpdateProfRole` mutation
  with class-side cleanup when switching to caissier
- `src/routes/admin/tabs/profs/ModalProfDetail.tsx` — 3-way role picker
  (Professeur / Caissier / Admin), self-guard, classes+matières
  sections hidden when role=caissier

### Caissier-name propagation
- `src/routes/admin/tabs/finances/ModalElevePaiements.tsx` — uses
  `resolveCaissierName` with override
- `src/routes/admin/tabs/inscriptions/GuichetView.tsx` — same

### Rules file
- `firestore-6d.rules` — full replacement rules for this phase

## Testing

### 1. Role promotion flow
1. Create a fresh prof signup
2. Admin approves them
3. Open the prof's detail modal → Rôle section shows 3 options
4. Select "Caissier" → confirm the mutation succeeds
5. Verify their classesIds + matieres become empty (check Firestore)
6. Verify they were removed from each class's professeursIds

### 2. Caissier login
1. Caissier logs out (if logged in as prof)
2. Logs back in via `/auth/prof` with their email + password
3. Should be routed to `/caissier` (not `/prof`)
4. Dashboard header: name-override card in Terminal tab
5. Three tabs visible: Terminal / Bilan / Inscriptions

### 3. Name override
1. Terminal tab → click "Modifier" on the name card
2. Type "Marcel" → OK
3. Go to Terminal → record a paiement for a student
4. Check Firestore: paiement.caissier === "Marcel"
5. Go to Guichet → finalize a fresh admission
6. Receipt PDF shows "Caissier : Marcel"
7. Log out → log back in → name should be back to default
   (LS cleared on logout)

### 4. Live role change (Option B reroute)
1. Caissier logged in on device A at `/caissier`
2. On device B, admin promotes them to "Professeur"
3. Device A should automatically navigate to `/prof` within a few
   seconds (no refresh needed)

### 5. Self-demotion blocked
1. As admin, open your OWN prof detail modal
2. The role buttons should be disabled
3. "Vous ne pouvez pas modifier votre propre rôle" message shown

### 6. Admin loses access
1. As admin, open Plus menu
2. Should only see 3 tiles: Emploi, Annonces, Année
3. No Finances, no Inscriptions
4. If admin tries to directly navigate to /caissier, ProtectedRoute
   bounces them to /admin

### 7. Rules enforcement
1. Deploy `firestore-6d.rules`
2. As caissier, try to delete a class via the Firebase console impersonating
   their UID — should fail with permission denied
3. As caissier, record a paiement — should succeed
4. As caissier, try to edit a bulletin — should fail
5. Admin still has full access to everything they had before (except
   the removed UI surfaces)

## What's NOT in this phase

- **Multi-role** — roles stay exclusive. One user = one role at a time.
- **Per-caissier audit log** — the paiement.caissier field stamps the
  acting name, but there's no dedicated "caissier action log" surface.
  The bilan PDF's "Top retards" table + paiement records give 95% of
  the accountability admin needs.
- **Separate caissier signup** — they go through the prof signup then
  get promoted. Simpler and matches your current mental model.
- **Admin being able to ALSO act as caissier** — no, strictly
  separated. If admin truly needs to backfill a paiement, they'd
  demote themselves temporarily or ask a caissier.

## Roadmap after 6d

- **6e — Sub-modes nav redesign** (kill Plus menu entirely; fold
  Emploi+Annonces+Année into a "Pédagogie" tab with internal mode
  switcher). Admin ends up at 5 flat tabs.
- **6f — SaaS subscription kill switch** (FedaPay renewal flow)
- **6g — Vendor command center** (multi-school admin for Ludosky)
