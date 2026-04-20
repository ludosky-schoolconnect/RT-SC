# Phase 5d.3 — Bulletin removal from accueils + 14-day absence cleanup

## What this phase ships

Two small but important polish items:

1. **Bulletin widget removed** from élève and parent accueils. Bulletins
   already have their own tab; duplicating them as the hero of the
   accueil pushes the actually-useful operational widgets (Cours du jour,
   Heures de colle, Annonces) below the fold.

2. **14-day auto-cleanup** of stale declared absences. Matches the
   legacy SC behavior. Without this, declarations accumulate in
   Firestore forever — after 6 months of operation a school easily
   has 1000+ dead docs slowing the school-wide listener.

## Bulletin removal rationale

Looking at the parent accueil screenshot, the entire upper half was a
big "Pas encore de bulletin" placeholder card. New parents see a giant
empty box explaining nothing they didn't already know (no bulletins
yet → check the Bulletins tab when there are some). Even when bulletins
exist, the "Featured bulletin" was a duplicate of what's one tap away.

The accueil should be operational, not a bulletin display. After this
patch:

**Élève accueil**:
- Greeting + name + classe
- "Mon suivi" → Cours du jour, Heures de colle, Annonces
- "À venir" → English Hub preview (where the bulletin used to be)

**Parent accueil**:
- Greeting + child resume line
- "Suivi scolaire" → Cours du jour, Heures de colle (parentMode)
- "Vie de l'école" → Annonces, Paiement de scolarité (preview)
- "Communauté" → Annuaire des parents (preview)
- *No English Hub* — parents don't care about a kid's vocabulary streak.
  They want school operations info.

Also dropped the standalone "Absences et retards" preview widget from
the parent accueil's "Vie de l'école" section — it's a real tab now,
no need for a placeholder.

## 14-day cleanup design

Implemented in `useSchoolAbsences` (the admin school-wide hook). Runs
inside the snapshot callback:

```ts
const cutoff = Date.now() - FOURTEEN_DAYS_MS
snap.docs.forEach((d) => {
  const refMillis = tsToMillis(data.createdAt) || tsToMillis(data.date)
  if (refMillis && refMillis < cutoff) {
    if (!cleanupAttempted.has(d.id)) {
      cleanupAttempted.add(d.id)
      deleteDoc(...).catch(...)
    }
    return // exclude from rendered list
  }
  fresh.push(...)
})
```

### Why on the admin hook specifically

- Admin opens Vie scolaire daily as part of triage workflow → cleanup
  runs naturally when needed, no cron required.
- Admin has Firestore permission to delete (rules: `allow delete: if
  isStaff()`).
- Doing it on student/parent hooks would be wrong — they'd try to
  delete and hit permission errors.
- Server-side cron via Cloud Function would be cleaner, but adds
  infrastructure dependency. Client cleanup is good enough for v1.

### Dedup via session Set

`cleanupAttempted` is a module-scoped `Set<string>` of doc IDs we've
already tried to delete in this session. Firestore often delivers
multiple snapshot batches in quick succession during initial load;
without dedup we'd fire the delete write N times for the same stale doc.
Set re-init on page reload (which is fine — the docs ARE deleted by
then anyway).

### Failure handling

`deleteDoc(...).catch()` — failures are warnings, not errors. If
permission gets revoked or network blips, the stale doc just stays
visible and we'll retry next session. No user-visible disruption.

## Files

### Modified

- `src/routes/_shared/AccueilTab.tsx`  
  Dropped `useEleveBulletinList`, `ModalBulletinDetail`, `Spinner`,
  `useState`, `useMemo`, `Periode` imports. Removed the
  loading/featured/placeholder block AND the trailing
  `<ModalBulletinDetail>`. Function signature unchanged.

- `src/routes/_shared/ParentAccueilTab.tsx`  
  Same imports cleanup as élève. Removed bulletin section JSX, the
  trailing `<ModalBulletinDetail>` block, AND the standalone
  "Absences et retards" `<PreviewWidget>` (since Absences is a real
  tab now).

- `src/hooks/useSchoolAbsences.ts`  
  Added 14-day cleanup logic inside the snapshot callback. Stale docs
  are excluded from the rendered list AND deleted via `deleteDoc()`.
  Dedup via session-scoped Set so we don't fire the same write twice.

## Spam protection — full picture

For clarity, RT-SC absences now have THREE layers of spam protection:

1. **Per-write quotas** (5d.2a) — `checkQuota()` in
   `useEleveAbsencesMutations.ts`: max 1 declaration per same-day, max
   3 per current week. Client-enforced before the mutation fires.

2. **Server-side time window** (5d.2a) — Firestore rule using
   `request.time.hours()` enforces 06h–18h Bénin local. Can't be
   bypassed by changing device clock.

3. **14-day auto-cleanup** (this phase) — admin's school-wide hook
   silently deletes anything older than 14 days. Keeps the data set
   fresh and fast.

## Testing priorities

1. **Élève accueil** — log in as élève, no more "Pas encore de
   bulletin" hero card. English Hub preview should be where bulletin
   was.

2. **Parent accueil** — log in as parent, no bulletin block at all.
   No "Absences et retards" placeholder either (it's a real tab).

3. **14-day cleanup** — manually create a test absence with a
   `createdAt` from > 14 days ago (via Firestore console). Open admin
   Vie scolaire. The doc should disappear from the list AND be
   deleted from Firestore. Check the Firestore console to confirm.

4. **Cleanup dedup** — open admin Vie scolaire, leave it open for
   30 seconds, network tab should NOT show repeated delete writes for
   the same doc.

5. **Bulletins tab still works** — make sure the actual Bulletins tab
   in both élève and parent dashboards is unaffected by this change.
