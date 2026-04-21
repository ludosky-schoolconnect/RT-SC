# Phase 4g — Year archive browse UI

## What this phase ships

Read-only browse surface for `/archive/{annee}/...` — the year
snapshots that `ModalArchiveAnnee` has been writing since Phase 4
but that had no corresponding UI to read them back.

Admin now drills: **Années → Classes → Élèves → Élève detail** with
a breadcrumb, plus a per-élève transcript export (CSV or PDF).

## The gap this closes

The year rollover (`ModalTransitionEleves` → `ModalArchiveAnnee`) has
been fully operational for months:

- `classes/{id}` gets copied to `/archive/{annee}/classes/{id}`
- Each élève + all subcollections (notes, bulletins, absences,
  paiements, colles) gets copied to the archive
- Announcements + emplois du temps too
- Live classes are reset with new passkey for the new year

But the archived data was **inaccessible from the UI**. Admin could
run the rollover and see the "Year archived successfully" toast, but
if a parent later asked "what were Marie's grades in 3ème two years
ago?" there was no way to answer without going into the Firebase
console.

This phase adds that answer.

## Metadata doc — the anchor

The Firebase JS SDK doesn't expose `listCollections()` on the client,
so discovering which years have been archived isn't trivial. The
cleanest fix: **write a metadata doc** at `/archive/{annee}` during
rollover. One `getDocs('archive')` then gives admin the list.

Added as a new step between the annonces archival and the
`anneeActive` bump in `src/lib/rollover.ts`:

```ts
await setDoc(docRef(archiveYearDoc(annee)), {
  annee,
  classesCount: result.classesProcessed,
  elevesCount: result.elevesArchived,
  errorsCount: result.errors.length,
  archivedAt: serverTimestamp(),
})
```

Denormalized counts on the metadata doc mean the years-list cards
don't need to query subcollections just to show "12 classes · 487
élèves". One read per year instead of N.

### Retroactive note for existing archives

If you've already archived years before this patch, those `/archive/
{annee}/` trees won't have the metadata doc. Two paths:

1. **Manual**: create the doc by hand in Firebase console for each
   past year (only 1-2 fields matter: `annee`, `archivedAt`).
2. **Migration snippet** (admin-only): can add a one-time
   "Reconstruct metadata" button to the Année tab if needed. For a
   single-school CEG, probably not worth building unless you have
   several archived years already. Defer until asked.

New archives (future rollovers) will have it automatically.

## Browse hierarchy

The structure mirrors the drill-in pattern from the Vie scolaire's
Par classe mode, just with one more level:

```
YearArchiveSection (container + breadcrumb)
    ↓
YearsList     — card per archived year
    ↓
ClassesList   — 2-col grid of classes for that year
    ↓
ElevesList    — elves of that class, with search
    ↓
EleveDetail   — 4-tab detail: Bulletins / Notes / Absences / Paiements
```

State held in one `crumbs` object on `YearArchiveSection`:
```ts
{ annee, classeId, classeNom, eleveId, eleveNom }
```

Routing between views is purely local state — `useState`, no URL
params. This is deliberate: the archive is an admin tool, not a
shareable surface, and keeping it self-contained means it doesn't
interact with the dashboard's tab-routing (which drives the main
admin tabs via query param).

## Breadcrumb

```
[Années]  ›  2024-2025  ›  3ème M1  ›  KPETA Marie
```

Each crumb is clickable except the last (current page). Navigates
by shortcutting the crumbs state — no history stack, no re-mount.

## Identity card

The élève detail opens with a denormalized identity card: name,
matricule, genre, phone/email/address. Context admins need when
issuing transcripts or answering phone enquiries.

## Read-only everywhere

No mutation on anything archived. Zero delete, zero edit. Reasoning:

- **Legal / pedagogical record**: archived grades and behavior notes
  may need to be produced years later (alumni, certifications,
  regional inspectorates)
- **Denormalization makes edits dangerous**: bulletins carry
  snapshotted moyennes, but notes carry sub-scores. Editing one
  without the other creates inconsistency that's hard to detect
  and impossible to repair without the live source (which is gone
  after rollover).
- **Out of scope for this phase**: even if we wanted an admin "fix
  a typo in an archived note" feature, it needs heavy confirm, audit
  log, and probably 2FA. Not worth it for a rare operation.

If administrative error needs correction, the path is: Firebase
console direct edit (admin-only, well-tracked by Firestore's audit
log).

## Per-élève transcript export

Each élève detail has an "Exporter" button in the identity card that
downloads their full transcript for that year. Two formats:

- **CSV** — one file with sections ("BULLETINS", "NOTES") separated
  by blank rows. Identity pairs at top. UTF-8 BOM for Excel. Filename:
  `releve-marie-kpeta-2024-2025-20260421-1542.csv`.

- **PDF** — proper formal transcript. Navy header bar with school
  name + "Relevé de scolarité". Identity paragraph (Matricule +
  Classe + Année). Bulletins table (période / moyenne / conduite /
  colles / rang / verrouillage). Notes table grouped by matière.
  Navy header rows, zebra striping.

Built as a new lib file `src/lib/transcript-export.ts` (not mixed
with absence-export.ts because bulletins + notes have fundamentally
different shapes from absences). Helpers shared in spirit — same
CSV conventions, same PDF styling vocabulary.

Lift pattern: bulletins + notes are fetched at the top of
EleveDetail (not in each tab) so the export button has them in
scope. React Query cache makes this free — the tab children
re-read the same keys without refetching.

## Files

### New
- `src/hooks/useYearArchive.ts` — 5 read hooks (`useArchivedYears`,
  `useArchivedClasses`, `useArchivedClasse`, `useArchivedEleves`,
  `useArchivedEleve`, generic `useArchivedEleveSub<K>` for notes/
  bulletins/absences/paiements/colles)
- `src/lib/transcript-export.ts` — CSV + PDF transcript builders
- `src/routes/admin/tabs/annee/archive/YearArchiveSection.tsx` —
  container with crumbs + breadcrumb + body router
- `src/routes/admin/tabs/annee/archive/YearsList.tsx` — card list
- `src/routes/admin/tabs/annee/archive/ClassesList.tsx` — grid
- `src/routes/admin/tabs/annee/archive/ElevesList.tsx` — list + search
- `src/routes/admin/tabs/annee/archive/EleveDetail.tsx` — identity
  card + export button + 4-tab detail

### Modified
- `src/lib/rollover.ts` — writes metadata doc at `/archive/{annee}`
  at end of rollover (step 3bis between annonces and annee bump)
- `src/types/models.ts` — adds `ArchivedYear` interface
- `src/routes/admin/tabs/annee/AnneeTab.tsx` — mounts
  `YearArchiveSection` below Danger Zone

## Firestore rules

Existing rules for `/archive/` likely already cover read. If not:

```
match /archive/{annee} {
  allow read: if isStaff();
  allow create: if isStaff(); // for rollover metadata doc
  match /{path=**} {
    allow read: if isStaff();
  }
}
```

If reads are blocked, the years list will show "Aucune année
archivée" even with data present. Check console logs — a rules
denial logs clearly.

## What's NOT in this phase

- **Delete an archived year** — as noted, out of scope. If ever
  needed, build as admin-only with multi-step confirm and an audit
  log entry.
- **Archived annonces / emploi du temps browse** — the rollover
  archives these too but they're less valuable historically than
  per-élève records. Defer until someone requests.
- **Restore an archive to live** — massive foot-gun. Out of scope.
- **Cross-year search** — "all grades Marie has ever received
  across every year". Would need an élève-keyed flat index. Defer;
  current use cases are year-at-a-time.
- **Per-class summary export** — "all students' bulletins in one
  CSV for a class". Useful for trimester reviews. Defer; per-élève
  is the more frequent need.
- **Metadata reconstruction** migration for pre-patch archives. See
  "Retroactive note" above.

## Testing priorities

1. **Run a rollover, then browse it**  
   End-to-end: open Année tab → Zone dangereuse → run transition
   + archive. Once complete, the "Archives annuelles" section below
   should show the new year as a card with counts.

2. **Drill all the way through**  
   Click year → see classes. Click class → see élèves with search.
   Click élève → see identity card + 4 tabs. Click through each tab.

3. **Breadcrumb nav**  
   From élève detail, click "3ème M1" in breadcrumb → back to élèves
   list. Click year → back to classes. Click "Années" → back to
   years.

4. **Search élèves**  
   Class with 30+ élèves → search box appears, typing narrows live.

5. **Export CSV**  
   Élève detail → Exporter → CSV. Opens in Excel with accents intact.
   Contains identity header, BULLETINS block, NOTES block.

6. **Export PDF**  
   Élève detail → Exporter → PDF. Opens with school name + title in
   navy bar, identity line, bulletins table, notes table.

7. **Export disabled when empty**  
   Navigate to an élève with no bulletins + no notes → Exporter
   button is disabled/greyed.

8. **Retroactive archive (if any exist from before this patch)**  
   Open Archives annuelles — existing archives WITHOUT the metadata
   doc won't appear. Expected behavior per "Retroactive note"
   above. Either create metadata docs manually or accept that
   pre-patch archives are Firebase-console-only.
