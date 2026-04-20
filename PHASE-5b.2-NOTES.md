# Phase 5b.2 — Annonces: Edit, Delete, and Any-Prof Composer

## What this phase does

Three related upgrades to the Annonces module:

1. **Any prof can post** — not just the prof principal.
2. **Edit** — authors + admins can edit their own annonces after publishing.
3. **Delete** — authors + admins can delete any time (complements expiration).

## Rationale

### Any-prof composer

Previously only PPs could compose. But every teaching prof has legitimate
communications to make to classes they teach:

- "Devoir de maths reporté à vendredi"
- "Apportez votre dictionnaire pour le prochain cours"
- "La correction du contrôle sera distribuée lundi"

These are prof-to-their-class messages, not coordination duties. PP is a
coordination role for bulletins and school-family liaison — it shouldn't gate
day-to-day teaching communication.

**New scope rules**:
- Admin: school-wide OR any specific classes
- Any prof: only classes they teach (intersection of `profil.classesIds`)
- PPs no longer get a special pathway — they post exactly like any other prof

### Edit

A typo in a published annonce used to force delete-and-repost. Now the author
(or admin) can fix it in place and the change propagates instantly via
`onSnapshot`.

### Delete

Expiration was already in 5b — the "auto-hide later" convenience. But it
didn't cover the "I posted something wrong, remove it now" case. Explicit
delete covers that, with a danger-variant confirmation dialog.

**Expiration vs explicit delete**:
- **Expiration** = scheduled fade-out. The doc stays in Firestore but gets
  filtered out of visible lists when `expiresAt < now`.
- **Delete** = immediate, permanent removal of the document.

Both options exist because they answer different needs. "Réunion parents-profs
le 10 mai" wants expiration (auto-hide the day after). "Oops, wrong class"
wants delete.

## Permission matrix

| Action | Admin | Prof (author) | Prof (not author) | Élève / Parent |
|---|---|---|---|---|
| Read | ✓ | ✓ | ✓ (if in scope) | ✓ (if in scope) |
| Create (school-wide) | ✓ | ✗ | ✗ | ✗ |
| Create (specific classes they teach) | ✓ | ✓ | ✓ | ✗ |
| Edit own | ✓ | ✓ | ✗ | ✗ |
| Edit any | ✓ | ✗ | ✗ | ✗ |
| Delete own | ✓ | ✓ | ✗ | ✗ |
| Delete any | ✓ | ✗ | ✗ | ✗ |

Implementation:
```ts
const isAdmin = role === 'admin'
const isAuthor = role === 'prof' && user?.uid === annonce.createdBy
const canEdit = isAdmin || isAuthor
const canDelete = canEdit
```

## UX flow

### Editing

1. User taps an annonce row → `ModalAnnonceDetail` opens.
2. If `canEdit`, the footer shows **Modifier** (primary, right side).
3. Tap → detail closes, composer opens in edit mode with fields pre-filled.
4. Save → `useUpdateAnnonce` runs → toast → composer closes.
5. `onSnapshot` refreshes the row in the list automatically.

### Deleting

1. Same detail modal → **Supprimer** (danger variant, left side via `mr-auto`).
2. `useConfirm` shows a danger-variant dialog.
3. Confirm → `useDeleteAnnonce` → toast → modal closes.
4. `onSnapshot` removes the row from the list.

### Composer copy adapts

- Create: "Nouvelle annonce" / "Publier l'annonce" (prof short form: "Publier")
- Edit:   "Modifier l'annonce" / "Enregistrer"

## Files changed

- `src/routes/admin/tabs/annonces/AnnoncesAdminTab.tsx`  
  Added `editing` state + `openEdit` handler + `onRequestEdit` prop on detail
  modal. "Nouvelle annonce" button resets edit state first.

- `src/routes/admin/tabs/annonces/ModalComposeAnnonce.tsx`  
  Optional `editAnnonce` prop with a `useEffect` re-hydration block. Submit
  dispatches create or update based on `isEdit`. Title + button labels adapt.
  Footer disable/loading checks both mutations.

- `src/routes/prof/tabs/annonces/AnnoncesProfTab.tsx`  
  Dropped `useMyPPClasses` / `isPP` gate. Now uses `useClasses` ×
  `profil.classesIds` → `teachingClasses`. Same edit wiring as admin tab.
  Composer is mounted whenever `canCompose || !!editing` (covers the odd case
  of a prof who was the author but has been unassigned since).

- `src/routes/prof/tabs/annonces/ModalComposeAnnonceProf.tsx`  
  Prop rename `ppClasses` → `teachingClasses`. Header copy adapts to single vs
  multiple teaching classes. Same edit-mode plumbing as admin composer.

- `src/routes/_shared/annonces/ModalAnnonceDetail.tsx`  
  Footer rebuilt: danger **Supprimer** (left via `mr-auto`), secondary
  **Fermer**, primary **Modifier** (with `Pencil` icon) when `canEdit &&
  onRequestEdit`. Handles the confirm + delete mutation inline. Optional
  `onRequestEdit` callback emitted to parent so the right composer (admin vs
  prof) opens.

## What's NOT changed

- `useAnnoncesMutations.ts` — `useUpdateAnnonce` and `useDeleteAnnonce` were
  already shipped in 5b.
- `AnnonceRow`, `AnnoncesWidget`, `ModalAnnoncesList` — read-only views.
- Firestore schema — no changes. Existing `createdBy` field (author UID,
  denormalized at create time) is what permission checks read.

## Firestore security rules note

Client-side checks are UX-level. Production Rules should mirror:

```
match /annonces/{id} {
  allow read: if request.auth != null;
  allow create: if request.auth != null
    && request.resource.data.createdBy == request.auth.uid;
  allow update, delete: if request.auth != null
    && (
      resource.data.createdBy == request.auth.uid
      || request.auth.token.email == 'ludoskyazon@gmail.com'
    );
}
```

(Adjust admin check to match your custom claims setup in production.)

## Testing priorities

1. **Any-prof composer** — log in as a non-PP teaching prof, verify "Nouvelle
   annonce" button shows and only their teaching classes appear in the
   checkbox list.

2. **Author edit path** — prof creates an annonce, taps it, sees Modifier,
   edits body, saves, verifies live refresh.

3. **Non-author cannot edit** — different prof who shares the class scope:
   detail modal shows only "Fermer".

4. **Admin can edit anything** — including prof-authored annonces, with full
   scope picker (school-wide + classes) available.

5. **Delete confirmation** — danger variant, irreversible wording.

6. **Delete cascades through onSnapshot** — row disappears from admin tab,
   prof tab, widget, and inbox within a second.

7. **Edge case: unassigned author** — admin removes a prof from a class after
   they authored an annonce, that prof can still edit (composer mounts via
   `canCompose || !!editing`).

8. **Scope change in edit** — admin changes school-wide → classes-scope,
   verifies audience updates.
