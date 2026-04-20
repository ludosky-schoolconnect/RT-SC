# RT-SC · Phase 3d-iii — Year Rollover UI (Final Admin Sub-Phase)

This is the last admin sub-phase. After this, **the entire admin dashboard is complete** and we move on to Phase 4 (Notes & Bulletins).

## What's new

| Area | Status |
|---|---|
| Transition élèves modal | **Functional** — multi-step wizard |
| Final archive modal | **Functional** — type-to-confirm + multi-step exec |
| DangerZoneCard | Wired with both modal launchers (no longer placeholder) |

## How year rollover works

Year-end is a **two-step process** the admin performs in sequence:

### Step A — Transition des élèves (per class)

For each class with élèves in it, the admin opens the Transition modal and:

1. **Picks a source class** from the dropdown
2. **Marks each élève** as Admis / Échoué / Abandonné
   - Default: Échoué (safer — admin must explicitly promote)
   - Bulk "Tout marquer admis" / "Tout marquer échoué" buttons available
   - Visual color-coded buttons (green/orange/red) per row
3. **For each Admis, picks a destination class**
   - Smart default: same série, next-level (e.g. 5ème C → 4ème C)
   - Skipped automatically if there are no Admis
4. **Reviews the dry-run summary** ("3 admis vers 4ème B, 2 échoués maintenus, 1 abandonné archivé")
5. **Executes** — progress bar updates per élève
6. **Sees the result** with success count and any errors
7. **Can immediately do another class** without closing the modal ("Traiter une autre classe")

Once an élève has been processed, they're flagged `_transfere: true` and won't appear in the modal again during this session — even if you switch classes and come back.

### Step B — Archiver l'année (school-wide)

Once all classes have been processed, the admin opens the Archive modal:

1. **Sees the year transition banner**: e.g. "2025-2026 → 2026-2027"
2. **Reads the destruction warning** with full bullet list of what will happen
3. **Types the year string verbatim** to enable the Execute button (anti-fat-finger)
4. **Executes** — multi-step progress: Classes → Vigilance IA → Annonces → Année
5. **Sees the result** — counts + any warnings

After the archive runs:
- All classes have new passkeys
- Professeur Principal field is cleared on every class
- `anneeActive` is bumped to the new year
- `presences`, `vigilance_ia`, `annonces`, emploi du temps are wiped (with backup to archive)
- Everything is browsable in `/archive/{old-year}/...` for posterity

## What to test

Both modals are wired into the **Année tab → Zone dangereuse** section.

### Test the Transition modal — safe dry-run

1. Make sure you have at least one class with a few test élèves
2. Annee tab → Zone dangereuse → "1. Transition des élèves" → "Lancer"
3. Walk through all 4 steps. **Don't click "Lancer la transition"** at the end if you don't want to actually move data.
4. Click "Annuler" or close the modal — nothing happens.

### Test the Transition modal — real run

1. Make sure you have at least 2 classes, with élèves in the source class
2. Open the Transition modal, pick the source
3. Mark a couple as Admis, leave others Échoué, mark one Abandonné
4. Pick destinations for the Admis
5. Review and execute
6. Verify in Firestore Console: Admis are now in the destination class, échoués stayed, abandonné is in `archive/{annee}/classes/{cid}/eleves/{eid}` and gone from active.

### Test the Final Archive modal

⚠️ **Don't run this against real data unless you actually want to archive.** This is the destructive operation that wipes everything for the new year.

If you want to test it safely:
1. Set up a throwaway Firebase project, OR
2. Use Firestore Emulator if you have one, OR
3. Just walk through to step 1 and click Annuler

## Edge cases handled

- Élèves already `_transfere`'d are filtered out of the Transition modal (no double-handling)
- "Continuer" button on the Classify step is disabled if there are no pending élèves
- "Continuer" button on the Destinations step is disabled if any Admis lacks a destination
- "Lancer" button on Final Archive is disabled until the year string matches exactly
- Modal cannot be closed (overlay/escape) during execution — only the result step lets you out
- The X button is hidden during execution
- Errors per-item don't abort the whole flow — they're collected and shown at the end
- Cache invalidation hits all affected classes after Transition (live snapshots auto-refresh)
- Cache invalidation refreshes Classes + EcoleConfig + SchoolStats after Final Archive

## What's NOT in this phase

- **Cancel button mid-execution** — not supported because Firestore writes can't be reversed mid-flight. The "don't close the app" warning is the safety net.
- **Per-class progress in Final Archive** — only overall steps. Adding per-class would require streaming progress from the library; currently the lib reports just the step name.
- **Roll-back option after a failed run** — defer to a manual restore-from-archive flow if it's ever needed (data is in `/archive/{annee}` so it's recoverable).

## Where this leaves us

```
Phase 0       ✅ Foundation
Phase 1       ✅ UI primitives
Phase 2       ✅ Auth flow
Phase 2.5     ✅ Public face polish
Phase 3a      ✅ Dashboard + Classes tab
Phase 3b      ✅ Élèves tab
Phase 3c      ✅ Profs tab
Phase 3d-i    ✅ Année tab core + bug fix
Phase 3d-ii   ✅ CMS editor + rollover library
Phase 3d-ii.1 ✅ AboutPage error fix + firestore rules
Phase 3d-iii  ✅ Rollover UI                      ← we are here
                ─────────────────────────────────
                ADMIN SIDE COMPLETE
                ─────────────────────────────────
Phase 4       ⏭  Notes & Bulletins
                  - Closure intelligence Layers A & B
                  - Bulletin computation engine (already in lib/bulletin.ts)
                  - Note entry with autosave
                  - Per-prof view of assigned classes
                  - Per-class bulletin generation with PDF export
                  - PP preflight for ranking + class moyenne
```

Phase 4 is going to be the most exciting phase — the closure intelligence we designed (mode-based trend check, per-matière abandon flags, completeness layer A) finally comes alive, plus the bulletin engine that already lives in `lib/bulletin.ts` gets real UI to drive it.
