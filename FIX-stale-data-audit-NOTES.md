# Fix patch — stale data audit + fixes

## Why this patch

Following Ludosky's observation that stale data in financial/identity
contexts can lead to "real world catastrophic problems", I audited
every mutation hook in the app for cases where the TanStack cache
might lag behind Firestore and surface incorrect data to admin/caissier/
parents.

This doc is both a changelog for the fixes AND a record of what was
checked and intentionally left alone.

## Cache staleness risk levels

**HIGH RISK (money, attendance, identity)**
- Finances config (scolarité, frais annexes)
- Paiements
- Class rosters (who belongs where)
- Élève identity (PIN, passkey parent)

**MEDIUM RISK (dashboard counts, bilan results)**
- School stats (class count, élève count, etc.)
- Cached bilan computation

**LOW RISK (configuration, cosmetic)**
- Bulletins (immutable once created)
- Archive list (changes once/year)

## Fixes shipped

### 1. Finances config change now force-refetches + drops bilan

**`useUpdateFinancesConfig`**

Before:
```ts
onSuccess: () => {
  qc.invalidateQueries({ queryKey: ['finances', 'config'] })
}
```

After:
```ts
onSuccess: () => {
  void qc.refetchQueries({ queryKey: ['finances', 'config'] })
  qc.removeQueries({ queryKey: ['finances', 'bilan'] })
}
```

**Why it matters**: if admin changes `scolarite` from 75,000 to 80,000
FCFA, the next balance calculation (in ResultRow + ModalElevePaiements
+ Bilan) MUST use the new number. With `invalidateQueries` alone, if
nothing's currently mounted that reads the config, the cache stays
stale until the 10-min stale window expires. A caissier could
accidentally mark a student "soldé" at the old cible amount while the
school has raised tuition.

With `refetchQueries`, the new config lands in cache within a few
hundred ms. `removeQueries` on the bilan drops the now-incorrect
cached computation, forcing recomputation next time admin opens the
Bilan card.

### 2. Class create → refetch school-stats

**`useCreateClasse.onSuccess`** now also calls:
```ts
void qc.refetchQueries({ queryKey: ['school-stats'] })
```

Dashboard headline count ("12 classes") updates immediately instead
of waiting up to 2 minutes.

### 3. Class delete → refetch school-stats + useAllEleves

**`useDeleteClasse.onSettled`** now also calls:
```ts
void qc.refetchQueries({ queryKey: ['eleves', 'all'] })
void qc.refetchQueries({ queryKey: ['school-stats'] })
```

Deleting a class cascade-deletes its élèves (handled by the mutation
itself). Without this refetch, Finances terminal de caisse would keep
showing those deleted élèves as searchable rows with stale balances.
A caissier could accept a paiement for a student who doesn't exist.

## Already fixed in previous patch (verified)

### `useCreateEleve`
- Only seeds `['eleves', 'all']` if cache was already hydrated
- Force-refetches after seeding (so the authoritative server list overwrites the optimistic entry)

### `useUpdateEleve`
- `onSettled` patches the entry in `['eleves', 'all']` in-place
- Name changes propagate to Finances search + Bilan immediately

### `useDeleteEleve`
- `onSuccess` filters the deleted entry out of `['eleves', 'all']`
- Force-refetches so any unusual state gets reconciled from server

### `useFinalizeInscription` (guichet finalize)
- Optimistic seed guarded by `cached.length > 0`
- Force-refetch on success
- Paiement cache pre-seeded for instant terminal/bilan display

## Audited as already-safe (no fix needed)

### Snapshot-backed hooks (self-healing)
These use `onSnapshot` → `qc.setQueryData`, which pipes Firestore's
authoritative stream directly into the cache. They cannot be stale
unless the listener is disconnected.

- `useClasses` — class list
- `useProfs` — teacher directory
- `useEleves(classeId)` — per-class roster
- `useElevePaiements(classeId, eleveId)` — per-student paiements
- `useFinancesConfig` (for READ) — staleTime applies but writes force
  refetch (fix above)
- `useSettingsInscription` — inscription config
- `useMatieres` — subject list

### Paiement mutations
- `useAddPaiement` — relies on onSnapshot to push the new doc in.
  Already working correctly; no manual cache touching needed.
- `useDeletePaiement` — same pattern.

### Prof role mutations
- `useUpdateProfRole`, `useAssignProfToClasse`, etc. — all follow the
  proper optimistic + onError rollback + onSettled invalidate pattern.
  onSnapshot reconciles.

### Login / auth flows
- Student, parent, and admin logins read directly from Firestore via
  `getDoc`/`getDocs` — never from the TanStack cache. So regenerating
  a student's codePin or resetting a passkey takes effect instantly
  on the next login attempt. No stale data risk.

### Bulletin data
- `useEleveBulletinList`, `useBulletinView` — bulletins are immutable
  once created. Staleness is harmless (a just-created bulletin may
  take a minute to appear in the list, but that's not dangerous).

## Intentionally left as-is (low impact)

### `useSchoolStats` after élève mutations
`useCreateEleve.onSuccess` calls `invalidateQueries(['school-stats'])`
rather than refetch. The dashboard is where admin does these
operations, so the hook is mounted; it'll refetch automatically on
the next render cycle. Upgrading to refetch would save maybe 100ms.
Not worth the code churn.

### `useYearArchive`
Archive list changes at most once/year (when admin runs rollover).
No staleness risk in practice.

## Files changed

- `src/hooks/useFinances.ts` — `useUpdateFinancesConfig` force-refetch
- `src/hooks/useClassesMutations.ts` — `useCreateClasse` and
  `useDeleteClasse` refetch stats/eleves

## Test

1. Apply zip, hard refresh
2. **Financial config test**: Année tab → change scolarité from current
   to something different (add 5000) → Save. Immediately open Finances
   → open a student's paiement modal → verify cible reflects the NEW
   scolarité without page refresh.
3. **Class delete test**: create a throwaway class with no students →
   delete it → go to Finances → class picker shouldn't include it.
   Dashboard class count should decrement.
4. **Class create test**: create a new class → dashboard headline
   stats should reflect +1 classes immediately.
5. **Already-passing from previous patch** (just re-confirm):
   - Add student → Finances shows full class list incl. new student
   - Edit student name → Finances search finds new name
   - Delete student → doesn't linger in Finances

## What this patch is NOT

- No rules changes
- No new features
- No logic changes — just cache-management fixes
- Not related to Phase 6d (caissier role) — still next up after this
