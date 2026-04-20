# RT-SC · Phase 4a — Notes & Bulletins Foundations

The first sub-phase of Notes & Bulletins. **No daily prof workflow yet** — this phase ships the underlying read/write infrastructure plus the admin-side reference data editors (matières + coefficients).

## What's new

| Area | Status |
|---|---|
| `useMatieres` hook | **Functional** — read + write the global matières list |
| `useCoefficients` hook | **Functional** — per (niveau, série) coefficients |
| `useNotes` hooks | **Functional** — per-élève + per-matière-grid (collectionGroup) |
| `useColles` hook | **Functional** — read + add + delete colles per élève |
| `useBulletins` hook | **Functional** — read live bulletins per élève |
| Année tab → Matières editor | **Functional** — add/remove matières with confirm |
| Année tab → Coefficients editor | **Functional** — niveau/série pickers + grid |
| Note entry UI | Phase 4b (next) |
| Closure flow | Phase 4c |
| Bulletin PDF | Phase 4d |

## Année tab restructured

The tab is now organized into 3 visual subsections:

1. **Configuration générale** — School identity, active year, bulletin config (existing)
2. **Référentiel pédagogique** — NEW. Matières + coefficients editors. This is where you set up the academic reference data that Phase 4b/c/d depend on.
3. **Zone dangereuse** — Year rollover ops (existing)

## Matières editor

- Add via the input + "Ajouter" button (or hit Enter)
- Duplicate detection (case-insensitive) — toast warning if already in list
- Auto-sorts alphabetically (French collation)
- Remove via the × on each badge → confirm warning explains that existing notes for that matière stay in the database (non-destructive removal — just hides the matière from dropdowns going forward)
- Save button disabled until you've actually changed something
- Animated add/remove

## Coefficients editor

- Pick a cycle (Premier / Second)
- Pick a niveau (cycle-aware: Premier shows 6ème→3ème, Second shows 2nde→Terminale)
- For Second cycle, also pick a série (A/B/C/D)
- Grid renders all matières from the global list + the special "Conduite" row at the end (always present)
- Type a coefficient per cell. Decimals allowed (e.g. 2.5)
- Empty cell = matière is excluded at this niveau (won't appear in bulletins)
- Per (niveau, série) doc → multiple classes of the same level/série share one coefficient set

## Important: Required Firestore composite index

The new `useNotesPourMatierePeriode` hook (which Phase 4b will use heavily) does a `collectionGroup` query on `notes` filtered by `matiere` + `periode`. Firestore needs a composite index for this.

**Two ways to create it:**

### Option A: Auto-prompt (easier)

The first time the query runs (Phase 4b once it's wired), Firestore will throw an error in the browser console with a one-click URL like:

```
https://console.firebase.google.com/project/.../firestore/indexes?create_composite=...
```

Tap that URL → Firebase Console opens with the index pre-filled → click Create. Index builds in 1-5 minutes.

### Option B: Deploy via Firebase CLI (proactive)

The index is already in `firestore.indexes.json` (this patch). To deploy:

```bash
cd ~/RT-SC && firebase deploy --only firestore:indexes
```

Either approach works. Option A is the typical mobile-dev flow.

## What to test in this patch

1. Apply patch, restart dev server
2. Log in as admin → **Année** tab
3. **Matières editor** — add 5-6 matières (e.g. Mathématiques, Français, SVT, Histoire-Géographie, Anglais, EPS). Save. Try adding a duplicate (case-insensitive). Try removing one — confirm dialog appears.
4. **Coefficients editor** — pick "Premier cycle" → "6ème". Fill in some coefficients (e.g. Mathématiques: 4, Français: 4, SVT: 2, Histoire-Géographie: 3, Anglais: 3, EPS: 1, Conduite: 1). Save.
5. Switch to "1ère" / "Série C" — should be empty (different doc). Fill in different coefficients. Save.
6. Switch back to 6ème — your earlier values should still be there.

## Verify in Firebase Console

After saving:
- `ecole/matieres` should contain `{ liste: ['Anglais', 'EPS', 'Français', 'Histoire-Géographie', 'Mathématiques', 'SVT'] }`
- `ecole/coefficients_6ème-null` should contain your 6ème coefficients
- `ecole/coefficients_1ère-C` should contain your 1ère C coefficients

## Architecture notes (for continuity)

- **Matières**: one global doc `/ecole/matieres = { liste: [...] }`. Single source of truth.
- **Coefficients**: per (niveau, série) doc at `/ecole/coefficients_{niveau}-{serie|null}`. Matches the legacy structure — no migration needed. The "Conduite" entry is always present and treated like a regular matière for bulletin computation.
- **Notes**: stored at `/classes/{cid}/eleves/{eid}/notes/{noteId}` where `noteId = "{periodSlug}_{matiereSafe}"` (stable upserts — no duplicates if the same note is "saved" twice).
- **Bulletins**: stored at `/classes/{cid}/eleves/{eid}/bulletins/{periode}`. Doc id = period name. Computed during the closure flow (Phase 4c).
- **Colles**: stored at `/classes/{cid}/eleves/{eid}/colles/{auto}`. Profs add, only PP (or admin) can delete. Total hours / 2 deduct from baseConduite.

## What's NOT in this patch

- Note entry UI (per-matière grid for daily prof work) — **Phase 4b**
- Closure flow (Layer A completeness + Layer B trend check + PP preflight + period close) — **Phase 4c**
- Bulletin display + PDF export per élève + per class — **Phase 4d**
- Élève-side bulletin viewer — **Phase 8**
- Parent-side bulletin viewer — **Phase 9**

## Coming next

**Phase 4b — Note entry UI for profs:**

- New "Notes" tab in the prof dashboard (similar adaptive nav to admin)
- Class selector — only the prof's assigned classes appear
- Period selector (auto-detects current period from BulletinConfig + today's date)
- Matière selector (only matières the prof teaches)
- Per-élève grid: 3 interro cells (max — the moyenne uses non-null only) + dev1 + dev2
- Inline edit with debounced autosave (500ms)
- "Calculer & Clôturer" button that runs the bulletin engine for that matière+period and locks the row
- Read-only "Vue par élève" toggle (secondary view: one élève, all matières)
- Optimistic feedback per cell

After Phase 4b, profs can do their daily work. Then Phase 4c brings the closure intelligence to life.
