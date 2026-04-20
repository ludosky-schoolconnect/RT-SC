# RT-SC · Phase 5b — Annonces module (v1: create + display)

The Annonces vertical is now functional end-to-end. Admin creates, élève + parent see live on their Accueil, tap to read full markdown content.

## What ships

### 1. Data model

New `Annonce` type in `src/types/models.ts`:

```ts
interface Annonce {
  id: string
  title: string
  body: string                          // markdown
  scope: { kind: 'school' } | { kind: 'classes'; classeIds: string[] }
  priority: 'info' | 'important' | 'urgent'
  expiresAt?: Timestamp                 // optional auto-hide
  createdAt: Timestamp
  createdBy: string                     // admin uid
  createdByName?: string                // denormalized
  updatedAt?: Timestamp
}
```

Stored at `/annonces/{auto}`. Admin writes; all authenticated roles read.

### 2. Admin — new "Annonces" tab

Added between "Profs" and "Année" in the admin dashboard bottom nav. New tab features:

- Full list of annonces, most recent first
- Each row: title, priority badge, scope summary ("Toute l'école" / "2 classes"), date, author name
- "Nouvelle annonce" action button opens the composer

**Composer (`ModalComposeAnnonce`)** — a polished form:

- Title (max 120 chars, live counter)
- Body textarea (markdown supported — lists, bold, italic, links, blockquotes via the existing `.prose-rt-sc` styles)
- Priority: 3-button picker (Info / Important / Urgent) with tone-colored active state
- Destinataires: radio "Toute l'école" vs "Classes spécifiques" + checkbox list
- Optional expiration date (toggle to reveal; YYYY-MM-DD; treated as end-of-day)

Validation: title + body required, at least one class required when scope=classes, expiration date in the future.

### 3. Élève + parent Accueil — live widget

The previously-placeholder "Annonces récentes" tile is now live via `AnnoncesWidget`:

- **0 annonces** — quiet card: "Rien de nouveau pour le moment."
- **≥1 annonces** — card shows count + latest title + priority dot (navy/warning/pulsing red for urgent). Tap opens `ModalAnnoncesList`.

`ModalAnnoncesList` is the inbox view: list of all in-scope annonces, most recent first. Tap a row → `ModalAnnonceDetail` opens on top (nested modal; back button / X correctly unwind one at a time thanks to Phase 5a.1's stack fix).

`ModalAnnonceDetail` renders the full markdown body with the existing `.prose-rt-sc` styling. Priority badge + scope + date + author in the header.

### 4. Scope filtering

`useAnnoncesFor([classeIds])` hook handles the consumer side. Filters:

- Not expired (`expiresAt` absent OR in future)
- Scope is 'school' OR includes at least one of the consumer's classeIds

For parent users we pass the active child's classeId (single-child scope). Multi-child case: tile shows only the active child's annonces. When the parent swaps child, tile updates naturally. (Alternative — merge all children's annonces — considered but rejected as confusing; the child switcher makes context explicit.)

### 5. Widget placement

- **Élève Accueil**: Annonces widget in "Mon suivi" section (was under "À venir"). "À venir" now only holds English Hub.
- **Parent Accueil**: Annonces widget in "Vie de l'école" (replacing the preview). Absences, Emploi, Paiement remain previews until their modules ship.

Parent: the "Vie de l'école" section title still fits since the remaining 3 previews are all school-life modules. When they all ship we'll rename or restructure.

## Files changed

```
MOD  src/types/models.ts                                  Annonce type + scope/priority enums
NEW  src/hooks/useAnnonces.ts                             live query + scoped filter
NEW  src/hooks/useAnnoncesMutations.ts                    create/update/delete
NEW  src/routes/admin/tabs/annonces/AnnoncesAdminTab.tsx  list + compose trigger
NEW  src/routes/admin/tabs/annonces/ModalComposeAnnonce.tsx composer
NEW  src/routes/_shared/annonces/AnnoncesWidget.tsx       Accueil live tile
NEW  src/routes/_shared/annonces/ModalAnnoncesList.tsx    inbox list
NEW  src/routes/_shared/annonces/ModalAnnonceDetail.tsx   full body
MOD  src/routes/admin/AdminDashboard.tsx                  new Annonces tab
MOD  src/routes/_shared/AccueilTab.tsx                    widget replaces preview
MOD  src/routes/_shared/ParentAccueilTab.tsx              widget replaces preview
```

Also: my 5a.4 duplicate `lib/greeting.ts` was replaced in favor of the existing `useGreeting()` hook (which is better — it has Benin timezone awareness and auto-refreshes every minute). Élève + parent Accueils now use `useGreeting()` properly.

## Apply on Termux

```bash
cd ~/RT-SC && unzip -o ~/storage/downloads/RT-SC-phase5b-annonces.zip
```

No `npm install` needed (react-markdown was already installed). Vite hot-reloads.

## What to test

### Admin side
1. Sign in as admin → new "Annonces" tab visible in bottom nav (5 tabs total now)
2. Tap "Nouvelle annonce"
3. Fill title, body (try markdown: `**bold**`, `- list`, `[lien](https://...)`)
4. Priority picker — try each, visual feedback per tone
5. Scope: pick "Classes spécifiques" → checkbox list appears → select 2-3 classes
6. Toggle expiration → date picker appears → pick a date
7. Submit → toast "Annonce publiée" → form resets → modal closes
8. New annonce appears at top of list
9. Tap the row → detail modal opens → markdown is rendered nicely

### Élève side
1. Sign in as élève in a class targeted by an annonce (or an "all school" annonce)
2. Accueil shows the Annonces widget in "Mon suivi" with count + latest title + priority dot
3. Tap → inbox modal with list
4. Tap a row → detail modal opens on top
5. Back button: closes detail first, then inbox (Phase 5a.1 stack fix)
6. X on detail: only detail closes, inbox stays

### Parent side
Same as élève but under "Vie de l'école" section of ParentAccueilTab.

### Scope filtering
1. Create an annonce scoped to "Classe 3ème M1"
2. Élève in 3ème M2 → widget shows nothing (or previous "all school" annonces only)
3. Élève in 3ème M1 → widget shows the new one
4. Set expiration to yesterday → widget hides it everywhere

### Edge cases
- Empty annonces list on consumer side → quiet "Rien de nouveau" tile
- Annonce with no expiration → always shown
- Markdown edge cases: bold, italic, lists, links, blockquotes should all render

## Known not shipped (Phase 5b.1+)

- **Admin edit/delete** of an annonce — detail modal is read-only for all roles right now. 5b.1.
- **Prof-side Annonces tab** — prof dashboard has an Annonces tab placeholder. 5b.2 wires it.
- **Prof composer** — currently admin-only. PPs can broadcast to their class in a future phase if needed.
- **Read tracking** — no "new" vs "seen" state. Deferred.
- **Multi-child parent merge** — parent tile shows active child's annonces only. When swapping child, widget refetches. Acceptable.

## Status

```
Phase 5b       ✅ Annonces v1 (create + display)          ← we are here
Phase 5b.1     ⏭ Edit / delete / prof Annonces tab
Phase 5c       ⏭ Emploi du temps
Phase 5d       ⏭ Absences + Appel
Phase 5e       ⏭ PP Vie scolaire
Phase 6        ⏭ Inscription + Finances + admin polish
```
