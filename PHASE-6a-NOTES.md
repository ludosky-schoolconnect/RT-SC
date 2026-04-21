# Phase 6a — Finances + nav refactor (Plus pattern)

## What this phase ships

Two interlocking pieces:

1. **Nav refactor**: Admin moves from 7 flat tabs to **5 primary tabs +
   Plus overflow**. Mobile bottom nav is no longer crowded. Less-frequent
   tools live under Plus (Emploi, Annonces, Finances, Année).

2. **Finances module (admin-only)**: full CRUD over scolarité tracking.
   Cashier records cash payments manually, the app maintains running
   balances per élève, generates A4 receipts, and produces school-wide
   bilans on demand.

**Important business model context**: SchoolConnect is a SaaS sold to
schools. The school's parents pay scolarité in cash to the school's
caissier, who records it here. **The app never touches money.** All
online payment integration (FedaPay) is reserved for the school
paying YOU (the SaaS vendor) — that's Phase 6d.

## Architecture decisions

### Why "Plus" instead of more tabs?

8 tabs in the mobile bottom nav is the threshold beyond which icons
shrink past usable size and labels become unreadable. We were already
there with 7. Adding a Finances tab (8th) would have been the breaking
point.

The "Plus" tab pattern is industry-standard for this exact problem
(see iOS App Store, Twitter mobile, Reddit, etc.). It's a known UX
vocabulary that doesn't need explanation.

### Split rationale: which tabs are primary, which are in Plus?

Primary (visible all the time):
- **Classes**, **Élèves**, **Profs** — daily setup/lookup
- **Vie** — daily monitoring (appel, absences)
- **Plus** — overflow

Plus (one tap away):
- **Emploi du temps** — read-mostly after initial setup; admin rarely
  touches it daily
- **Annonces** — sporadic communication
- **Finances** — daily for cashier-class admins, but NOT for head admin.
  And opening Plus first frames it as a separate concern (which it is).
- **Année** — configuration, end-of-year operations, archives. Very
  rarely accessed.

### Why state-based Plus surface (not nested routes)?

Plus opens an overflow MENU. When admin taps an item inside Plus,
the page transitions to that item's content with a "Retour à Plus"
button to return. This is implemented with local `plusSurface`
state on `AdminDashboard`, NOT React Router nested routes.

Reasoning:
- The current dashboard already uses query-param tabs (`?tab=eleves`)
  rather than nested routes. Mixing nested routes with that pattern
  inside Plus would be inconsistent.
- The Plus surfaces are themselves complete tabs (`AnneeTab`,
  `EmploiAdminTab`, etc.) that work standalone. We just compose them
  inside Plus.
- Browser back button: the existing tab system handles back to
  history naturally; the Plus state is ephemeral within the Plus tab,
  so back-button in Plus drops you out of Plus to whatever tab was
  before — which is the right mobile behavior.

## Finances module — design notes

### `calculerCible` — gratuité logic

Lifted directly from legacy `app.js` line 8053. The Béninois
government subsidizes scolarité for filles in public secondary
schools. There are two switches because the subsidy applies
differently to 1er cycle (6è–3è) vs 2nd cycle (2nde–Tle).

```ts
let cible = fraisAnnexes
const isFille = (genre).toUpperCase().startsWith('F')
const isSecondCycle = niveau matches /2nde|1ère|terminale|tle/i
const exempt = isFille && (isSecondCycle ? grat2nd : grat1er)
if (!exempt) cible += scolarite
```

Frais annexes ALWAYS apply (no gratuité there — those are non-
subsidized fees like uniforms, textbooks, etc.).

### Why no FedaPay for scolarité?

You explicitly don't want to handle parent money. Three reasons this
is the right call:

1. **Liability**: handling money creates regulatory obligations
   (anti-money-laundering, payment processor compliance, refund
   handling, fraud disputes).
2. **Complexity**: webhook reconciliation, idempotency, partial
   failures, refund flows — significant engineering for marginal
   parent convenience.
3. **Cultural fit**: parents in Bénin already pay tuition in cash
   directly to the school's caissier. There's no demand for a digital
   replacement.

Scolarité paiements are recorded BY ADMIN, after physical cash
exchange. The app's role is bookkeeping and receipts, nothing more.

### `useAllEleves` — collectionGroup query

For the finance search bar, admin needs to type a name and find ANY
élève school-wide without first knowing their class. Done via
`collectionGroup('eleves')` — single query returns every élève in
every class.

Filters: skip docs whose path starts with `archive/` (collectionGroup
returns archived élèves too — those are NOT live and shouldn't be
searched). Live élèves' path always starts with `classes/`.

Cached 5min (no live snapshot). School roster doesn't change often
enough mid-session to justify N parallel snapshots. If admin adds a
new élève and immediately searches Finances, they'll see the new
élève after the next stale-time refresh (or on hard refresh).

### Receipt PDF — A4 duplex

Two copies on one page (top half = "Souche" school keeps, bottom
half = "Reçu parent"). Cut line between them with scissor emoji.
Why both on one page:
- Admin generates one PDF, prints one sheet, signs both halves,
  cuts down the middle, hands one to parent and files the other.
- Saves paper (one sheet vs two).
- Audit trail: souche and parent copy have identical content + same
  receipt number.

`numberToFrenchWords` is a small French number-spelling routine that
handles 0 to 999,999,999. Covers every plausible school fee amount.
Failures (overflow, edge cases) gracefully omit the words line —
amount in figures is always present.

### `BilanGlobalCard` — opt-in computation

Computing the school-wide bilan requires fetching paiements for EVERY
élève. For 500 élèves that's 500 reads per click. To avoid hammering
Firestore on every Finances visit:

- No automatic computation on mount
- Admin clicks "Calculer le bilan" to opt in
- Result cached in component state until admin clicks "Recalculer"
- Adds in chunks of 10 parallel fetches to stay under Firestore's
  per-second limits

Numbers shown:
- Total encaissé (sum of paiements across all élèves)
- Total cible (sum of cibles given gratuité config)
- Reste à recouvrer
- Taux de recouvrement (encaissé/cible × 100)
- Counts: soldés / à jour partiellement / en retard
- Top 10 retards (élèves with the largest gaps, sorted desc)

CSV + PDF export uses the existing ExportMenu component from 5d.9.

### Caissier identification

The `caissier` field on each paiement records WHO accepted the cash.
Pulled at write time from (in order):
1. Admin's `Professeur.nom` (set when they joined as admin)
2. Firebase `displayName`
3. Firebase `email`
4. Fallback string "Administration"

Hardcoded order — no dropdown of caissiers, no manual freetext entry.
Reduces fraud surface (admin can't fake who accepted the money) and
keeps the workflow fast (one less form field to fill).

If you eventually want multiple caissiers per school (head accountant,
assistant, etc.) sharing one admin account, that needs a sub-role
mechanism. Out of scope for now.

## Files

### New (Phase 6a)
- `src/components/layout/PlusMenu.tsx` — reusable overflow menu
- `src/hooks/useFinances.ts` — config read/write + `calculerCible`
- `src/hooks/usePaiements.ts` — paiements live snapshot + add/delete
- `src/hooks/useAllEleves.ts` — collectionGroup-based school-wide list
- `src/lib/receipt-export.ts` — A4 duplex receipt generator
- `src/routes/admin/tabs/finances/FinancesAdminTab.tsx` — main surface
- `src/routes/admin/tabs/finances/FinancesConfigCard.tsx` — config editor
- `src/routes/admin/tabs/finances/ModalElevePaiements.tsx` — per-élève
  modal (balance + composer + history)
- `src/routes/admin/tabs/finances/BilanGlobalCard.tsx` — global aggregate
  with on-demand compute + CSV/PDF export

### Modified
- `src/types/models.ts` — `EcoleConfig` adds `adresse` + `telephone`;
  `Paiement` adds optional `methode` + `note`
- `src/routes/admin/AdminDashboard.tsx` — rewritten with 5 primary tabs
  + Plus overflow surface
- `src/routes/admin/tabs/annee/SchoolIdentityCard.tsx` — adds adresse
  and telephone inputs (visible on receipts)

## Firestore — no rules changes

Paiements live at `/classes/{cid}/eleves/{eid}/paiements/` which is
already covered by the broad `match /classes/{path=**} { allow ...
if isStaff() }` rule deployed long ago.

`/ecole/finances` config doc is also already covered by the existing
`/ecole/{path=**}` admin rule.

`collectionGroup('eleves')` was already deployed for the EleveSignup
and ParentLogin flows.

**Nothing to deploy.** Apply the zip and test.

## Test priorities

1. **Plus pattern works** — open Admin, see 5 tabs at bottom (Classes,
   Élèves, Profs, Vie, Plus). Tap Plus → menu of 4 items appears. Tap
   Finances → see Finances surface + "Retour à Plus" button up top.
   Tap Retour → back to Plus menu. Same flow for Emploi, Annonces, Année.

2. **Tap Année from Plus** — should show the same Année tab as before
   the refactor (identity, bulletin config, matières/coeffs, danger
   zone, archives annuelles all present).

3. **Set school identity with new fields** — Année → identity card →
   fill adresse + téléphone → save. Verify they persist in Firestore.

4. **Configure finances** — Plus → Finances → top card, set scolarité
   (e.g. 60000), frais annexes (e.g. 5000), enable gratuité 1er cycle.
   Click Enregistrer.

5. **Search élève** — type a few letters in the search bar. Should see
   matches with their class name and "Cible" amount on the right. Cible
   should reflect the gratuité (filles in 6è with grat1er enabled →
   cible = frais annexes only, scolarité skipped).

6. **Add a paiement** — pick an élève → modal opens with balance card.
   Click "Ajouter une tranche" → composer expands. Enter montant, pick
   method, add optional note → Enregistrer. Should appear in history
   immediately. Balance updates. Caissier auto-filled.

7. **Receipt PDF** — click the document icon on any paiement row →
   should download an A4 PDF with souche + parent copy, school name,
   adresse + téléphone if set, élève name, classe, montant in figures
   AND in French words, mode, caissier, signature line.

8. **Delete a paiement** — click trash icon → confirm → row disappears,
   balance updates.

9. **Bilan global** — bottom card → click "Calculer le bilan" →
   progress shows. Then result with totals, taux, counts, top retards
   list. Click Recalculer to update. Click ExportMenu → CSV opens in
   Excel with accents intact, PDF opens with school header + tables.

10. **Verify gratuité math** — create a fille élève in 4ème (1er cycle)
    with grat1er enabled → her cible should equal `fraisAnnexes` only.
    Disable grat1er → her cible should be `scolarite + fraisAnnexes`.

## What's NOT in this phase

- **Pre-inscription** (Phase 6b/6c) — public form + admin approve flow
- **SaaS subscription module** (Phase 6d) — kill switch, FedaPay
  integration for the school paying YOU
- **Vendor command center** (Phase 6e) — your private surface to
  manage multiple client schools
- **Per-class summary export** — bilan is currently school-wide only.
  If admin wants "all 3ème M1 paiements as one CSV", deferred.
- **Subscription tiers** — single FinancesConfig per school. No
  per-classe scolarité variation.
- **Refunds / negative paiements** — out of scope. If a refund is
  needed, admin records a negative montant manually (works because
  totals just sum the field).
- **Audit log** — who deleted which paiement when. If fraud becomes a
  concern, this is a future addition.
