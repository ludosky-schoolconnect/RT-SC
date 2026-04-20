# RT-SC · Phase 4c-i — Layer A intelligence + role surfacing

The first proper sub-phase of the closure intelligence. Three things ship together:

1. **Real Layer A intelligence** in the per-matière closure flow — replaces the lightweight 4b.2 dialog
2. **Per-(élève × matière × période) abandon flag** — élèves can be excluded from a matière's bulletin without affecting their other matières
3. **PP role surfacing** — header label, hint banner, and a Saisie/Bulletins mode switcher in the Notes tab (only visible to PP)

This sets up the architecture for Phase 4c-ii (PP cross-matière dashboard with Layer B + period bulletin generation) and 4c-iii (annual finalization).

## What changed

| Area | Status |
|---|---|
| Per-matière closure | **Real Layer A** — per-élève resolution required |
| `Note.abandonne` flag | New field, per (élève × matière × période) |
| Bulletin engine | Doc updated — caller must filter abandoned matières |
| Autosave + abandon flag | **Critical: autosave preserves existing abandon flag** |
| Prof header role label | Shows "Professeur · PP" when applicable |
| Notes tab | Restructured — Saisie / Bulletins modes |
| PP hint banner | Visible in Saisie mode when PP somewhere |
| Bulletins mode | Scaffold — Phase 4c-ii fills it |

## Layer A — per-matière completeness

When the prof clicks **Calculer & Clôturer**, the modal classifies each élève:

- **Complet** : at least one interro AND at least one devoir → green
- **Incomplet** : some data but missing one side → orange
- **Vide** : no interros AND no devoirs → red

If everyone's Complet, the modal shows a green "All clear, you can close confidently" message and the Confirmer button is enabled immediately.

If anyone is Incomplet or Vide, the modal lists them. Each row has three actions:

1. **Continuer** — close with the current data (could be empty). Stores `estCloture: true`, computes whatever moyenne is possible (likely null for fully empty rows, partial moyenne for incomplet rows).
2. **Marquer absent** — sets `abandonne: true` on the note doc. The bulletin engine skips this matière entirely for this élève for this period (no contribution to moyenneGenerale, no penalty).
3. **Retour saisie** — cancels the close, modal closes, and the row scrolls into view + flashes with a yellow ring so the prof can find it and complete it.

The **Confirmer la clôture** button is disabled until every non-Complet élève has been resolved (Continuer or Abandonner). "Retour saisie" is global — picking it on any one row cancels the whole close.

Once Confirmer is clicked, every élève gets their `Note` doc written with:
- `estCloture: true`
- `moyenneInterros` and `moyenneMatiere` computed (or null if no data)
- `abandonne: true` if the prof picked Abandonner; `abandonne: false` otherwise

## Per-(élève × matière × période) abandon flag

This is the granular model — an élève can abandon EPS in Trimestre 1 and rejoin in Trimestre 2 without any data fiddling. The flag lives on the Note doc itself.

When the bulletin engine (Phase 4c-ii) computes `moyenneGenerale`, it filters out matières where `abandonne === true` for that élève for that period. The `totalCoeffs` denominator excludes the abandoned matière's coefficient too — so the élève isn't penalized.

### Critical autosave fix

In Phase 4b/4b.2, the autosave handler unconditionally wrote `abandonne: false`. That meant: prof marks Marie absent → confirms close → Marie's note doc has `abandonne: true`. Then prof goes back and types a value in Marie's row → autosave fires → abandon flag is silently flipped back to false.

Phase 4c-i fixes this in `useSaveNote`: the `abandonne` field is only written when the caller explicitly passes it. Autosave (which never passes it) leaves the existing field untouched thanks to Firestore's `merge: true` semantics.

So the safe behavior is:

- **Autosave during typing** → never touches `abandonne` field → existing value preserved
- **Closure commit** → always passes `abandonne: true | false` based on the modal decision

If a prof wants to un-abandon an élève later, they re-open the closure modal and pick "Continuer" instead of "Marquer absent" — that overwrites the flag to `false`.

## PP role surfacing

### Header label

The avatar dropdown's role label now shows:
- `Professeur` if the prof is not PP of any class
- `Professeur · PP` if the prof is PP of at least one class

Computed via the new `useMyPPClasses()` hook — pure derivation from auth profile + classes list, no new query.

### Saisie mode hint banner

When in Saisie mode AND the prof is PP somewhere, a small info banner appears above the selectors:

> ⭐ Vous êtes professeur principal de **3ème M1, 1ère D2**. Une fois que toutes les matières d'une période sont clôturées, vous pourrez générer les bulletins dans l'onglet *Bulletins*.

This builds awareness of the workflow without forcing the PP into a different screen.

### Mode switcher pill

When the prof is PP somewhere, a small pill at the top of the Notes tab toggles between:

- **Saisie** (default): the per-matière entry workflow we built in Phase 4b
- **Bulletins**: the PP-only workflow (scaffold here, real content in Phase 4c-ii)

URL param `?mode=bulletins` drives the mode. Non-PP profs never see the switcher (they always default to Saisie). If a non-PP prof manually puts `?mode=bulletins` in the URL, the tab silently falls back to Saisie.

### Bulletins mode (placeholder)

Phase 4c-i ships a scaffold:
- Lists which classes the PP is principal of
- Big "module en construction" empty state explaining what's coming

Phase 4c-ii will add:
- Cross-matière table (rows = élèves, cols = matières, cells = moyennes from the closed Notes)
- Layer B intelligence (mode-based outlier detection across the class)
- "Générer les bulletins de la période" button + PP preflight modal
- Bulletin doc generation per élève with ranking

Phase 4c-iii will add the annual finalization (moyenne annuelle, statut, annual ranking).

## What to test

### Closure modal — Layer A

1. Sign in as a prof with at least one class assigned and at least one matière
2. Notes tab → pick class + matière + period
3. Enter notes for some élèves but leave others empty (mix of Complet / Incomplet / Vide)
4. Click **Calculer & Clôturer**
5. Modal opens with three count tiles at the top showing the breakdown
6. Each non-Complet élève appears in a list — tap a row to expand it
7. Pick Continuer / Marquer absent for each
8. **Confirmer la clôture** stays disabled until every non-Complet élève is resolved
9. Try **Retour saisie** on any row — modal closes, the row scrolls into view + flashes yellow
10. Re-open the modal → all decisions reset (intentional — re-opening is a fresh review)
11. Resolve everyone → click Confirmer → toast confirms

### Verify in Firestore Console

Pick one élève you marked Absent — open `classes/{cid}/eleves/{eid}/notes/{nid}` — should see `abandonne: true`. Pick one you Continued → `abandonne: false`. Both should have `estCloture: true`.

### Critical: autosave preserves the abandon flag

1. After clôture, open the locked row (you can't edit it directly because `estCloture: true`). For this test, you'll need to use admin rights to set `estCloture: false` on the Marie KAKPO doc so you can edit again.
   
   *(Phase 4c-ii will give the PP an unlock action; for now this is admin-only via Firestore Console.)*

2. Once estCloture is false, type a value in Marie's row → autosave fires → check Firestore: `abandonne` field should still be `true` (preserved). Without this fix, autosave would have flipped it to false.

### PP role surfacing

1. As admin, assign yourself as Professeur Principal of one of your prof's classes
2. Sign in as that prof → header should show **Professeur · PP**
3. In Notes tab, the pill switcher (Saisie / Bulletins) should appear at the top
4. Saisie mode shows the new info banner with your PP classes listed
5. Click **Bulletins** → see the placeholder ("module en construction")
6. Sign in as a non-PP prof → no pill, no banner, no `Bulletins` mode

## Edge cases handled

- **Modal closes mid-flight** (overlay/escape disabled during `committing`): can't accidentally bail during writes
- **Concurrent modify** during closure: same last-write-wins as the rest of the autosave
- **Autosave AFTER commit** (rare): autosave would re-fire `merge: true` write — but `estCloture: true` is preserved AND `abandonne` is preserved (because not in input)
- **Re-opening the modal**: per-élève decisions reset (fresh review each time)
- **All-empty class**: modal shows 0 Complets, all in Vide, Confirmer disabled until each is decided

## What's NOT in this patch

- **Visual indication of abandoned rows** in the entry grid (e.g. greyed out, "Absent" badge) — small polish for a later patch
- **Unlock locked rows**: `estCloture: true` rows are read-only. Future PP unlock action lives in Phase 4c-ii alongside the period bulletin dashboard
- **Cross-matière dashboard, Layer B, bulletin generation, ranking** — all Phase 4c-ii
- **Annual finalization** (moyenne annuelle, statut) — Phase 4c-iii
- **Bulletin display + PDF** — Phase 4d

## Status

```
Phase 4a       ✅ Foundations + admin editors
Phase 4b       ✅ Prof note entry
Phase 4b.1     ✅ Build fix + period dates
Phase 4b.2     ✅ Dynamic interros + NaN fix + closure guard
Phase 4b.3     ✅ Hotfix oversized buttons
Phase 4c-i     ✅ Layer A intelligence + role surfacing    ← we are here
Phase 4c-ii    ⏭  PP cross-matière dashboard + Layer B + period bulletin generation
Phase 4c-iii   ⏭  Annual finalization (moyenne annuelle, statut, annual ranking)
Phase 4d       ⏭  Bulletin display + PDF
```
