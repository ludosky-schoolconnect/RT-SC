# RT-SC · Phase 4c-iii — Annual Finalization

The capstone of the Notes/Bulletins module. PP can now close the year — compute each élève's annual moyenne, statut (Admis/Échoué), and final ranking. Writes both an annual Bulletin doc AND denormalized fields on the Eleve doc, which **feeds the Transition modal** during year rollover so admin doesn't have to manually classify everyone.

Plus: the small UX cleanups we discussed are rolled into this patch.

## What's in this patch

| Area | Status |
|---|---|
| Annual moyenne formula | New — supports `standard` (last period ×2) and `simple` (equal weights), configurable in BulletinConfig |
| Annual closure orchestrator | New — `runAnnualPreflight`, `computeAnnualBulletins`, `writeAnnualBulletins`, `unlockAnnualClosure` |
| Bulletins mode sub-switcher | New — Période / Annuelle pill toggle |
| AnnualMode dashboard | New — per-élève table with per-period moyennes + annual moyenne + statut + rang |
| ModalAnnualClosure | New — preflight → confirm with stats preview → execute, with strong "irréversible" warning |
| TransitionModal integration | Updated — pre-fills Admis/Échoué decisions from `eleve.statutAnnuel` |
| Optimistic closure UI | Fixed — locked view appears immediately, no refresh needed |
| Button rename | "Calculer & Clôturer" → "Clôturer" |
| Layer B label | "Atypique (Layer B)" → "À vérifier — moins de notes" |

## Annual moyenne formulas

Two formulas, configurable in BulletinConfig via `formuleAnnuelle`:

**`standard` (default — Bénin convention)**: the LAST period weights double.
- 2 periods (semestre): `(S1 + S2*2) / 3`
- 3 periods (trimestre): `(T1 + T2 + T3*2) / 4`

**`simple`**: plain arithmetic mean across all periods, equally weighted.
- 2 periods: `(S1 + S2) / 2`
- 3 periods: `(T1 + T2 + T3) / 3`

The modal shows which formula is in effect (with a gold "×2" badge on the last period when standard).

If you want to add a UI control for switching the formula, that's a small follow-up in BulletinConfigCard. For now you can flip it manually in Firestore Console: `ecole/bulletinConfig.formuleAnnuelle` → `'standard'` or `'simple'`.

## What gets written

For each élève, the annual closure writes:

**1. An annual Bulletin doc** at `/classes/{cid}/eleves/{eid}/bulletins/Année`:
```ts
{
  periode: 'Année',
  moyenneGenerale: 13.42,        // same as moyenneAnnuelle, kept for consistency
  moyenneAnnuelle: 13.42,        // explicit
  statutAnnuel: 'Admis',         // | 'Échoué'
  rang: '5ème/30',
  perPeriodMoyennes: [
    { periode: 'Semestre 1', moyenne: 12.5 },
    { periode: 'Semestre 2', moyenne: 14.0 },
  ],
  formuleUsed: 'standard',
  estVerrouille: true,
  dateCalcul: '...',
  // Per-period contribution fields (totalPoints, etc.) are 0 on the annual
  // doc — full breakdown lives in the per-period bulletins
}
```

**2. Denormalized fields on the Eleve doc itself**:
```ts
eleve.moyenneAnnuelle = 13.42
eleve.statutAnnuel = 'Admis'
eleve.rang = '5ème/30'
```

This denormalization is intentional — it keeps the Transition modal fast (no need to query the bulletins subcollection for each élève just to know if they're Admis).

Both writes happen in a single Firestore batched write per élève (the whole class is one batch — fits well within the 500-op limit).

## Preflight rules (strict)

Annual closure is the most consequential operation in the app. Once `statutAnnuel` is set, that determines whether an élève advances. So the preflight is conservative:

1. **Every period must have a generated bulletin** for every élève. If T1 wasn't generated for élève X, that's a blocking error with their name.
2. **Every period bulletin must have `estVerrouille: true`**. Half-baked drafts are blocked.
3. **Class size must be > 0**.

Errors block. There are no warnings at this stage — everything must be perfect.

## Three-step modal

**Step 1: Preflight**
Hard danger banner at the top: "Action irréversible — la clôture annuelle détermine quels élèves passent en classe supérieure. Une fois validée, seul un administrateur peut l'annuler."

Lists periods to be included with the formula indicator (gold ×2 badge on the last period if standard). Lists every blocking error. "Continuer" enables only when zero errors.

**Step 2: Confirm**
Preview tiles: number of Admis, number of Échoué, class moyenne. Bullet list of what the action will do. Big red "Clôturer l'année" button.

**Step 3: Execute → Done**
Loader during write. Success or failure summary on completion. Triggers `onClosed()` callback which refetches data and shows a toast.

## TransitionModal integration

This is the payoff. In Phase 3d-iii we shipped a TransitionModal that admin uses during year rollover — they manually classify each élève as Admis / Échoué / Abandonné, pick a destination class for the Admis, and execute the rollover.

With Phase 4c-iii, the manual classification is **pre-filled from `eleve.statutAnnuel`**:
- If élève has `statutAnnuel: 'Admis'` → decision starts as `admis`
- If élève has `statutAnnuel: 'Échoué'` → decision starts as `echoue`
- If élève has no statut (PP didn't run annual closure for that class) → decision starts as `echoue` (safer default — admin must explicitly promote)

A new gold banner at the top of the classify step tells admin how many decisions came pre-filled:

> ⭐ 28 / 30 décisions pré-remplies depuis la clôture annuelle du professeur principal. Vous pouvez ajuster si nécessaire.

Admin can still override any decision — the pre-fill is informational and convenient, not authoritative. (Sometimes life happens — an élève with `statutAnnuel: 'Échoué'` might still be promoted by exception. Admin's call.)

## UX cleanups bundled in

### Optimistic closure UI

Before this patch: after clicking Clôturer, the modal closed and the success toast appeared, but the row still showed as editable for ~1 second until the snapshot round-trip caught up. You had to refresh to see the locked view.

Fixed: the closure handler now updates local row state immediately on each successful write (`estCloture: true`). The snapshot still arrives shortly after and reconciles authoritatively, but the user sees the lock instantly.

### "Calculer & Clôturer" → "Clôturer"

You're right that "Calculer" was misleading — moyennes compute live as you type. The closure action just persists+locks. Button renamed.

### Layer B labels in plain language

The cross-matière legend used to say "Atypique (Layer B)" — engineer-speak. Now reads "À vérifier — moins de notes". The status strip in BulletinsMode similarly switched from "X élèves atypiques détectés (Layer B)" to "X élèves à vérifier (moins de notes que la classe)".

The internal name `Layer B` stays in code/comments — it's a precise concept that's helpful for us. Just not user-facing.

## Apply on Termux

```bash
cd ~/RT-SC && unzip -o ~/storage/downloads/RT-SC-phase4c-iii.zip
```

No `npm install` needed.

## What to test

You'll need a class where every period has a generated bulletin. Easiest setup:

1. As **prof**: enter notes for at least 2 matières, close them
2. As **PP**: switch to Bulletins → Période → generate bulletins for every period of the year (Semestre 1 AND Semestre 2, or all 3 trimestres)
3. As **PP**: switch to Bulletins → **Annuelle** sub-tab

Then test:

### AnnualMode dashboard
- Class selector (PP classes only)
- Status strip should say "Tous les bulletins sont en place" (in green) if everything's done; otherwise X / Y readiness count
- Per-élève table shows each period's moyenne + empty annual columns (no annual closure yet)
- "Clôturer l'année" button enabled iff every élève has all periods done
- Button shows the formula in the row above ("Formule standard")

### ModalAnnualClosure
- Click "Clôturer l'année" → modal opens
- Hard red "irréversible" banner at top
- Periods shown with gold ×2 badge on the last (standard formula)
- Should pass preflight if your setup was clean — green "Toutes les périodes sont prêtes"
- Click "Continuer" → preview screen with Admis count, Échoué count, class moyenne
- Click "Clôturer l'année" (red button) → spinner → success
- Modal closes → table populates with annual moyennes, statuts, ranks
- Status strip turns gold: "Année clôturée pour cette classe"

### Verify in Firestore Console
- `classes/{cid}/eleves/{eid}/bulletins/Année` should exist with `moyenneAnnuelle`, `statutAnnuel`, `rang`, `perPeriodMoyennes`, `formuleUsed`
- `classes/{cid}/eleves/{eid}` should now have top-level fields `moyenneAnnuelle`, `statutAnnuel`, `rang`

### TransitionModal integration
- As **admin**, go to Année tab → Transition élèves
- Pick the class you closed → continue to classify step
- Should see the gold banner: "X / Y décisions pré-remplies depuis la clôture annuelle du PP"
- Élèves with `statutAnnuel: 'Admis'` should default to Admis (green); Échoué to Échoué (orange)
- Admin can still override via the buttons

### UX cleanups
- Click "Clôturer" on an open matière → locked view appears IMMEDIATELY (no refresh needed)
- Cross-matière table legend reads "À vérifier — moins de notes" not "Atypique (Layer B)"
- Status strip reads "X élèves à vérifier (moins de notes que la classe)" not "Layer B"

## Edge cases handled

- **Re-running annual closure** when one already exists: shows "Régénérer la clôture annuelle" button + warning banner; overwrites old values
- **Mixed PP statuses**: if a class has annual done and another doesn't, the Annuelle dashboard reflects per-class state
- **Missing period bulletins**: preflight blocks with a per-élève list of which periods are missing
- **Configurable formula**: defaults to `standard`; switch to `simple` via Firestore Console
- **PP cannot un-close annual** (intentional): they can override per-period stuff via the unlock buttons in Période mode, but annual is admin-only to undo

## What's NOT in this patch

- **UI control to flip the annual formula** between standard/simple — needs to be added to BulletinConfigCard. Can do as a small follow-up patch (~10 minutes of work)
- **Admin-side annual unlock UI** — the function `unlockAnnualClosure` exists in the lib, but no admin UI yet to trigger it. Admin would need Firestore Console for now.
- **Bulletin display screen for élèves/parents** — Phase 4d
- **PDF export** — Phase 4d
- **Trends across periods** ("+3 places vs Trimestre 1") — Phase 4d polish
- **Édgi cases for élèves who joined mid-year**: currently if they have all periods, they're processed normally; if missing some, preflight blocks

## Status

```
Phase 4a       ✅ Foundations + admin editors
Phase 4b       ✅ Prof note entry
Phase 4b.1-3   ✅ Hot fixes
Phase 4c-i     ✅ Layer A + role surfacing
Phase 4c-ii    ✅ PP cross-matière + Layer B + bulletin generation
Phase 4c-ii.1  ✅ Per-matière rank + Baromètre
Phase 4c-ii.2  ✅ moyenneMatiere bug fix + Recalculer cleanup
Phase 4c-iii   ✅ Annual finalization + UX cleanups   ← we are here
Phase 4d       ⏭  Bulletin display + PDF export (élève/parent views)
```

The Notes/Bulletins module is now functionally complete from the prof and PP side. Phase 4d switches to the consuming side: élèves and parents viewing bulletins, plus PDF export for printing.
