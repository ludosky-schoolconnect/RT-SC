# Polish batch — between Phase 6b and Phase 6c

Six small but high-value cleanups, batched into one patch to clear the
shortlist before Phase 6c (public pre-inscription form).

## 1. Centralized payment-state vocabulary

Replaces ambiguous "à jour" / "en retard" terminology with three precise
states confirmed during design discussion:

- **Aucun paiement** (paye = 0)
- **Paiement partiel** (0 < paye < cible)
- **Soldé** (paye >= cible)

A new helper `getEtatPaiement(paye, cible)` in `hooks/useFinances.ts`
returns the canonical `{ etat, label, variant }` triple. Every UI
surface (BalanceCard, BilanGlobalCard counts, finance result rows)
now reads from this single source. If you ever want to re-label
"Soldé" to "Réglé" or change the danger color, change one place.

The exported `EtatPaiement` type (`'aucun' | 'partiel' | 'solde'`) is
the only payment-state vocabulary in the system going forward.

## 2. Finances — class trier coexisting with search

Previously the Finances tab had only a name search bar. Now there's
a two-control top row:
- **Class picker** (defaults to "Toutes les classes")
- **Search bar** (filters within the picked class, or school-wide if
  no class chosen)

Picking a class shows ALL its élèves with their état + versé inline
(no need to click each one to see status). Typing a name narrows the
list. Both controls coexist — admin can pick "4ème M1" then type "KPETA"
to find that one student in the class.

Each row shows the live état badge (Aucun paiement / Paiement partiel
/ Soldé) and the live versé/cible amounts. Powered by per-élève
`useElevePaiements` listeners — TanStack dedupes by query key so the
listeners are efficient even with many rows visible.

A "réinitialiser" link clears both controls in one tap.

Result count cap: 100 rows max (more than any class size; protects
against accidentally rendering 500 listeners). Empty-state if no
results match the active scope.

## 3. Methode — freeform text input

The methode field on paiements was a chip selector (espèces / mobile
money / chèque / virement). Replaced with a freeform `<Input>` text
field — admin types whatever they want. Removes the fiction that the
app dictates which payment methods exist; some schools accept things
the chips didn't list (cash app, bank transfer specific to a partner,
etc.).

The `Paiement.methode` field is still optional. The receipt PDF still
prints it when set.

## 4. Year archive — de-assign profs from classes

Previously the year rollover archived classes and élèves but left
every Professeur's `classesIds` and `matieres` arrays pointing at the
old year's setup. New step in `executeFinalArchive`:

After vigilance_ia wipe and BEFORE annonces archive, every prof doc
gets `classesIds: []` and `matieres: []` written. Identity fields
(nom, email, role, statut) are untouched.

Failures don't abort the rollover — one prof failing logs a warning
and the loop continues. Aggregated count goes into `result.errors`.

Reasoning: classes get reset (new passkey, no PP, bumped année), so
the prof side has to follow. Without this, the new année's class
setup starts from a broken state where profs claim affiliation to
classes they're no longer assigned to.

The class-side fields were already being cleared in step 1e
(`profPrincipalId: ''`). Now both sides match.

## 5. Year archive — double-rollover guard

`executeFinalArchive` now reads `archive/{annee}` metadata FIRST.
If it exists, the function throws immediately with a French error:

> L'année 2025-2026 a déjà été archivée. Ré-exécuter écraserait les
> archives existantes avec des données vides. Pour rejouer
> l'opération, supprimez d'abord l'archive de 2025-2026 dans la zone
> "Archives annuelles".

Why: rollover empties the live collections after archiving them.
A second run would `setDoc` empty data over the previous archive
(silent corruption — admin doesn't see anything wrong until they
browse archives months later and find empty élèves).

The guard adds one extra `getDoc` read at the start. Negligible cost
for a once-a-year operation.

If admin wants to re-run for legitimate reasons (interrupted
rollover, manual cleanup needed), they delete the archive metadata
first via the existing "Supprimer cette archive" UI.

## 6. Shared `parseLiveElevePath` helper

The bug we fixed last patch — vanilla-era archive absences leaking
into the live triage view — happened because `useSchoolAbsences`
inlined its own path parser that didn't validate the live shape.
Other collectionGroup consumers (`useAllEleves`, future ones) were
each doing their own version of the same check.

Centralized in `lib/firestore-keys.ts`:

```ts
parseLiveElevePath(path: string, subColName?: string)
  : { classeId, eleveId } | null
```

Returns null for ANY path not under `classes/{cid}/eleves/{eid}/...`.
Optional `subColName` arg validates the last collection name too
(e.g. `'absences'` → only matches the 6-segment shape ending in that).

Refactored `useSchoolAbsences` to use it. Future collectionGroup
hooks (collectionGroup('paiements') for school-wide finance reads,
say) will use the same helper — guaranteed consistent live-only
filtering, single source of truth for path validation.

`useAllEleves` keeps its inline 4-segment check (élève docs
themselves, not subcollection items, are 4 segments not 6 — different
shape from what the helper validates). The pattern is the same; the
specifics differ.

## Files changed

- `src/hooks/useFinances.ts` — added `EtatPaiement` type +
  `getEtatPaiement` helper at end
- `src/hooks/useSchoolAbsences.ts` — uses shared `parseLiveElevePath`
- `src/hooks/useAllEleves.ts` — refactored path filter (cleaner check,
  same behavior; no archive leak risk)
- `src/lib/firestore-keys.ts` — exported `parseLiveElevePath`
- `src/lib/rollover.ts` — double-rollover guard at top of
  `executeFinalArchive`; new prof-clearing step after vigilance wipe;
  imports `professeursCol`
- `src/routes/admin/tabs/finances/FinancesAdminTab.tsx` — full rewrite:
  class picker + search coexist; rows show live status badge + amount
- `src/routes/admin/tabs/finances/BilanGlobalCard.tsx` — renamed
  `nbSoldes/nbAJour/nbRetard` → `nbSolde/nbPartiel/nbAucun`; CSV/PDF/
  badge labels updated; uses centralized helper for categorization
- `src/routes/admin/tabs/finances/ModalElevePaiements.tsx` — uses
  centralized etatInfo; methode now freeform `<Input>`; BalanceCard
  takes label+variant directly

## What this is NOT

- NOT a phase. No new surfaces, no new flows. Just sweeping cleanups
  that improve consistency, terminology, and architecture.
- NOT a rules change. Firestore rules untouched.
- NOT a data migration. Old paiements without `methode` still render
  fine (the field is optional). The `nbSoldes/nbAJour/nbRetard`
  fields existed only in component state, not Firestore — no migration
  needed.

## Test priorities

1. **Finance status terms** — open Finances → pick a class with mixed
   payment states → verify badges read "Aucun paiement", "Paiement
   partiel", "Soldé" only. No "à jour" / "en retard" anywhere.

2. **Class trier** — Finances tab → pick a class from the dropdown →
   should see all élèves of that class listed with état + versé. Type
   in the search bar → list narrows. Click "réinitialiser" → both
   reset.

3. **Methode freeform** — open paiement composer for any élève → type
   anything in the methode field (e.g. "MoMo Marcel" or "espèces") →
   save → verify it persists and renders on the receipt PDF.

4. **Bilan global terminology** — Bilan card → "Calculer" → verify
   the three count badges (soldés / paiement partiel / aucun
   paiement). Export CSV → check labels in spreadsheet.

5. **Double-rollover guard** — try running the year-end archive on
   an année you've already archived. Should fail immediately with
   the French error message naming the année. (Use a fresh fake
   année if you don't want to test on real data.)

6. **Year archive de-assigns profs** — after the next legitimate
   rollover, check any prof's doc in Firestore — `classesIds` and
   `matieres` should both be `[]`. Re-assign them for the new année
   from the Profs tab as needed.

7. **Vanilla absence delete** — the absence triage view (Vie scolaire
   → Déclarations) should now ONLY show live-path absences. Vanilla
   archive absences at `archive/2025-2026/...` no longer appear.
   (Last patch fixed this; this batch refactors the underlying helper
   into shared code.)
