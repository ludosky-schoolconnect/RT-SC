# RT-SC · Phase 5b.1 — Compose scroll fix + prof Annonces tab

Three fixes responding to your 5b testing:

## 1. Compose form scroll (bug fix)

You couldn't scroll down in the compose modal past the first few fields. The `<form>` element wrapping `ModalBody` + `ModalFooter` wasn't flex itself, so the Body's `flex-1 overflow-y-auto` had no height to compete for — effectively turning off its scroll.

Fix: the form is now `flex-1 min-h-0 flex flex-col overflow-hidden`. Body becomes the scrollable region, Footer stays pinned at the bottom.

Applied to both admin composer (`ModalComposeAnnonce`) and the new prof composer. All form fields — Title, Body, Priority, Destinataires, Expiration — reachable by scrolling.

## 2. Prof Annonces tab (feature completion)

The prof dashboard had an "Annonces" placeholder tab. Now it's wired up:

**Read-only inbox for all profs.** Shows annonces that are:
- school-wide (visible to everyone), OR
- scoped to a class the prof is assigned to

Filters are identical to the élève/parent consumer side — expired annonces are hidden, scope is respected.

**PP composer.** When the prof is PP (professeur principal) of at least one class, a "Nouvelle annonce" button appears. Opens a dedicated `ModalComposeAnnonceProf` with:
- Same fields as admin (title, markdown body, priority, optional expiration)
- Scope RESTRICTED to the prof's PP class(es). No "Toute l'école" option. That remains admin-only.
- If PP of exactly 1 class → scope is that class automatically, no selector shown.
- If PP of multiple classes → checkbox list of just those classes.

The `createdByName` is denormalized in the existing mutation hook, so parents/élèves see "par [Prof name]" in rows/details — this was already wired from Phase 5b.

## 3. Shared AnnonceRow extraction

The admin tab had `AnnonceRow` + `PriorityBadge` inline. Three surfaces needed them now (admin tab, prof tab, list modal). Extracted into `src/routes/_shared/annonces/AnnonceRow.tsx` as the single source of truth. Admin tab, prof tab, list modal, and detail modal all import from there. No behavior change — just cleaner dependency graph.

## Files shipped

```
NEW  src/routes/_shared/annonces/AnnonceRow.tsx               shared row + PriorityBadge
NEW  src/routes/prof/tabs/annonces/AnnoncesProfTab.tsx        inbox + (PP-only) compose trigger
NEW  src/routes/prof/tabs/annonces/ModalComposeAnnonceProf.tsx  PP composer
MOD  src/routes/admin/tabs/annonces/ModalComposeAnnonce.tsx   form scroll fix
MOD  src/routes/admin/tabs/annonces/AnnoncesAdminTab.tsx      use shared row
MOD  src/routes/_shared/annonces/ModalAnnonceDetail.tsx       import path fix
MOD  src/routes/_shared/annonces/ModalAnnoncesList.tsx        import path fix
MOD  src/routes/prof/ProfDashboard.tsx                        wire Annonces tab
```

## Apply on Termux

```bash
cd ~/RT-SC && unzip -o ~/storage/downloads/RT-SC-phase5b.1-profannonces.zip
```

No `npm install`. Vite hot-reloads.

## What to test

### Scroll fix
1. Admin → Annonces → "Nouvelle annonce"
2. Scroll down inside the modal. You should reach:
   - Title + 0/120
   - Contenu textarea
   - Priorité buttons
   - Destinataires radio + class list
   - Date d'expiration toggle + date picker
   - Annuler / Publier buttons at the bottom (pinned)
3. If anything's still cut off, send a screenshot with what you see.

### Prof inbox (non-PP)
1. Sign in as a prof who is NOT a PP of any class
2. Annonces tab → no "Nouvelle annonce" button
3. Empty state encourages waiting for admin/PP communications
4. Once an admin posts school-wide or a PP posts to a class you teach → visible

### PP composer
1. Sign in as a PP of at least one class
2. Annonces tab → "Nouvelle annonce" button visible
3. Tap → composer opens with scope locked to your PP class(es)
4. Single-class PP → no scope selector, implicitly targets your class
5. Multi-class PP → checkbox list of only your PP classes (no other classes, no "Toute l'école")
6. Publish → appears in your inbox AND in admin's list AND in parents'/élèves' Accueil widget for targeted class
7. Row/detail in all surfaces shows "par [Your Name]"

### Nested modal unwind
1. PP opens compose modal → tap X or Android back → closes cleanly to the tab

### Back button on Annonces tab
1. From prof dashboard on Annonces tab → tap Android back → exits to previous page (not a weird overshoot)

## On your other questions

- **Absences for students**: still Phase 5d. Marked "BIENTÔT" on Accueil tile. Adding before 5d would be empty scaffolding.
- **Vie de l'école / Communauté as tabs**: still Accueil sections. I'll restructure when the first module needing a full-screen view ships (Emploi 5c or Absences 5d) — that's when a bottom-nav tab is actually justified.

## Status

```
Phase 5b.1     ✅ Compose scroll + prof Annonces tab        ← we are here
Phase 5b.2     ⏭ Admin/PP edit + delete of annonces
Phase 5c       ⏭ Emploi du temps
Phase 5d       ⏭ Absences + Appel
Phase 5e       ⏭ PP Vie scolaire
Phase 6        ⏭ Inscription + Finances + admin polish
```

Edit + delete is the last bit to fully close the Annonces vertical. Small phase — can slot before 5c if you want, or we can push forward to 5c (Emploi du temps) since create/view is often 90% of real-world usage for announcements.
