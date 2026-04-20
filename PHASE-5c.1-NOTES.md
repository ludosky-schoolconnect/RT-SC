# Phase 5c.1 — Emploi du temps (admin foundation)

## What this phase ships

The full admin side of the emploi du temps. Admin picks a class, composes
the week's schedule one séance at a time, with live conflict detection.

Read views for prof and élève/parent come in **5c.2** (next phase). The
data model and shared components are built this phase so 5c.2 is mostly
tab wiring.

## Design decisions

### Flat `/seances` collection (not subcollection)

Legacy SchoolConnect used `/emploisDuTemps/{classeId}/seances/{id}`. Good
for admin's "show me this class's schedule" but painful for the prof's
"show me MY schedule" — that requires a `collectionGroup` query with a
composite index.

**New model:** flat top-level `/seances/{id}` with `classeId` and `profId`
as denormalized fields. Every read becomes a cheap `where()`:

- Admin class view: `where('classeId','==',X)`
- Prof weekly view: `where('profId','==',uid)`
- Élève view: `where('classeId','==',session.classeId)`

One listener in `useAllSeances` feeds every surface via memo filtering —
no duplicate reads.

### Variable slot duration

User confirmed Béninois CEG slots aren't fixed (1h vs 2h vs 30min break
between). The composer takes two `<input type="time">` fields, shows live
duration ("1h30"), and validates `debut < fin`.

### Smart matière selection

The composer reads `prof.matieres[]` from the prof profile:

- **Exactly 1 matière** → auto-fill, display as read-only info box with
  the derivation explanation ("Dérivée automatiquement du profil de …").
- **2+ matières** → explicit picker, only showing that prof's matières.
- **0 matières** (legacy profile edge case) → free-text input fallback.

Zero friction for the 95% case (one prof = one matière), graceful for
the polyvalent case.

### Conflict detection: warn, don't block

Two conflict kinds:
- **Prof**: same `profId`, same `jour`, overlapping time windows.
- **Classe**: same `classeId`, same `jour`, overlapping time windows.

The composer computes conflicts live as the admin fills the form. A
warning panel surfaces them with specific times and other-side context
("Mathématiques 08h00–10h00 en 5ème B"). The save button stays enabled
but flips to a **secondary** variant with the label "Enregistrer malgré
le conflit" — making the override deliberate.

Rationale: admins legitimately need overlaps during input (typing
mid-entry, quick corrections, intentional split sessions). Hard-blocking
would force cancel-and-restart.

Edit mode ignores the séance being edited against itself (via
`excludeId` in `findConflicts`).

### "En cours" + "Aujourd'hui"

- `EmploiGrid` emphasizes today's jour header with the navy palette and
  an "Aujourd'hui" pill.
- `SeanceCard` shows an "En cours" success badge when `isSeanceNow(s)`
  returns true (current jour + current time in `[debut, fin)`).

These helpers are pure and deterministic — 5c.2's read views and 5c.3's
"Prochain cours" widget will reuse them.

### Salle fallback

Each séance has an optional `salle` override. If blank, the class's
default salle (from `Classe.salle`) applies. The composer shows the
default as a placeholder hint so the admin knows what "blank" means.

## Data model

```ts
/seances/{auto}
{
  classeId: string          // denormalized FK
  profId: string            // denormalized FK (Firebase UID)
  matiere: string           // display name
  matiereId?: string        // safeMatiereId slug; optional for legacy
  jour: 'Lundi' | ... | 'Samedi'
  heureDebut: string        // "08:00" (HH:MM)
  heureFin: string          // "10:00"
  salle?: string | null     // override; null = use classe.salle
  anneeScolaireId?: string  // for archival when an année ends
  createdAt: Timestamp
  createdBy: string
  updatedAt?: Timestamp | null
}
```

## Files

### New

- `src/lib/seances.ts`  
  Pure helpers: `parseHHMM`, `formatHHMM`, `seanceDurationMinutes`,
  `formatDuree`, `seancesOverlap`, `findConflicts` (prof + classe kinds),
  `sortSeances`, `groupByJour`, `currentJour`, `currentMinutes`,
  `isSeanceNow`, `nextSeance` (with wrap-to-next-week).

- `src/hooks/useSeances.ts`  
  `useAllSeances()` — single onSnapshot → TanStack cache. Consumers
  filter via useMemo. Avoids derived-query staleness.

- `src/hooks/useSeancesMutations.ts`  
  `useCreateSeance`, `useUpdateSeance`, `useDeleteSeance`. Denormalizes
  createdBy from auth store.

- `src/routes/_shared/emploi/SeanceCard.tsx`  
  Touch-friendly card: time pillar (left) + matière/subtitle/duration
  (middle) + optional actions (right). "En cours" visual state.

- `src/routes/_shared/emploi/EmploiGrid.tsx`  
  Day-grouped stack; one header per jour; "Aujourd'hui" emphasis. Empty
  days configurable (`emptyDayText` string | null). Takes `subtitleFor`
  and `renderActions` callbacks so the same grid serves every role.

- `src/routes/admin/tabs/emploi/ModalComposeSeance.tsx`  
  Create + edit. Classe picker (lockable via `defaultClasseId`), prof
  picker with cross-class hint, smart matière, jour, time range with
  live duration, salle override, live conflict panel with override CTA.

- `src/routes/admin/tabs/emploi/EmploiAdminTab.tsx`  
  Class picker at top; grid below. Add / edit (tap card) / delete (confirm
  dialog).

### Modified

- `src/types/models.ts`  
  Replaced legacy `Seance` with flat-collection shape. Added `JOURS_ORDRE`
  exported const.

- `src/lib/firestore-keys.ts`  
  `seancesCol()` → `'seances'`, `seanceDoc(id)` → `'seances/{id}'`.

- `src/routes/admin/AdminDashboard.tsx`  
  Added `{ id: 'emploi', label: 'Emploi', icon: <CalendarClock/> }` tab
  between Profs and Annonces, wired to `EmploiAdminTab`.

## Firestore security rules (reminder for production)

```
match /seances/{id} {
  allow read: if request.auth != null;
  allow create, update, delete: if request.auth != null
    && request.auth.token.email == 'ludoskyazon@gmail.com';
    // Adjust to your admin custom-claim check.
}
```

Admin-only. Profs, élèves, parents read but don't write.

## What's NOT in this phase

- **Read views for prof / élève / parent** — Phase 5c.2. The grid
  component is already shared, so those tabs will be ~40 lines each.
- **"Prochain cours" Accueil widget** — Phase 5c.3 (optional polish).
- **Holidays / exceptions / annulations** — future phase; the data model
  leaves room for a parallel `/annulations/{date_seanceId}` collection.
- **Bulk paste / copy-week** — nice-to-have, deferred.
- **Salle conflict detection** — not added because the same salle might
  legitimately be used by two classes on different sites of the school.
  Can be added later if CEG HOUETO requests it.

## Testing priorities

1. **Class picker defaults to first class alphabetically** — changing the
   picker flushes any in-progress edit target.

2. **Smart matière**:
   - Create a prof with 1 matière → composer shows read-only info box.
   - Create a prof with 2 matières → composer shows matière dropdown
     populated from that prof's list.
   - Create a prof with 0 matières → composer shows free-text input.

3. **Conflict detection**:
   - Add a séance Mon 8–10h for prof X in classe A.
   - Try to add another Mon 9–11h for prof X in classe B → warning panel
     flags prof conflict.
   - Try to add another Mon 9–11h in classe A (different prof) → warning
     panel flags classe conflict.
   - Save button says "Enregistrer malgré le conflit"; save succeeds.

4. **Edit a séance without changing times** — conflict panel should NOT
   fire (self-exclusion via excludeId).

5. **Mobile layout** — open admin → Emploi on a phone; class selector
   should be full-width-ish; grid should stack vertically; touch targets
   on edit/delete should be 44px.

6. **Salle fallback** — create séance without salle → card shows no
   salle line (intentional; fallback will render at read time via the
   classe.salle lookup in 5c.2).

7. **"En cours" + "Aujourd'hui"** — if it's currently Monday 9h and you
   have a séance 8h–10h, the card should show a green "En cours" badge
   and the Monday header should be navy with an "Aujourd'hui" pill.
   Reproducibility: temporarily set device clock to a weekday morning.
