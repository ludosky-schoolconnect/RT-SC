# Fix patch — Finances terminal/bilan showing only the new student after add

## The bug

You said:
> "the terminal de caisse trier per class started not showing all the
> students of the class... actually shows it. But after a new student
> is added or officially registered, they only shows that last student.
> But when you refresh it show all and correct"

## Root cause — my previous fix was too eager

The last patch added an "optimistic seed" to `['eleves', 'all']` on
finalize onSuccess. The seed code read the current cache, appended
the new entry, and wrote back:

```ts
const cached = qc.getQueryData([...]) ?? []   // ← the bug
const next = [...cached, optimisticEntry].sort(...)
qc.setQueryData(['eleves', 'all'], next)
```

The `?? []` fallback was wrong. If the admin went straight to Guichet
WITHOUT first visiting Finances (which is the common case — caissier
work is just "approve → finalize"), `useAllEleves` had never been
mounted, so `getQueryData` returned `undefined`. The `?? []` turned
that into an empty array, and the seed wrote a **single-entry list**
to the cache.

Then when admin navigated to Finances, `useAllEleves` read that
single-entry cache as hot data (it's fresh, just seeded) and
displayed just the new student. The refetch eventually fixed it,
but the user saw wrong data in between.

## Fix

### Part 1: Don't seed an empty cache

```ts
const cached = qc.getQueryData([...])          // no ?? fallback

if (cached && cached.length > 0) {
  // cache is already hydrated — safe to append
  const next = [...cached, optimisticEntry].sort(...)
  qc.setQueryData(['eleves', 'all'], next)
}
// If cache is undefined, the refetch below will populate it fresh.
```

This applies to:
- `useFinalizeInscription.onSuccess` (guichet path)
- `useCreateEleve.onSuccess` (manual add via Élèves tab)

### Part 2: While I was there, also fix other stale-cache cases

Previously, `useCreateEleve`, `useUpdateEleve`, `useDeleteEleve`
didn't touch `['eleves', 'all']` at all. Editing a student's name
in the Élèves admin tab wouldn't update the Finances search row;
deleting a student would keep them as a ghost entry in terminal de
caisse for up to 5 minutes.

Fixes:

- **useCreateEleve** — append + refetch pattern, same as finalize
- **useUpdateEleve** — in-place patch of the existing entry in
  `['eleves', 'all']` (no full refetch needed since nom/genre/etc.
  are already known client-side). Only applies if the cache is
  hydrated; otherwise no-op.
- **useDeleteEleve** — filter out the deleted entry from cache +
  force-refetch to confirm. Unlike add, delete is already confirmed
  at this point, so immediate filtering is safe.

## Files changed

- `src/hooks/usePreInscriptions.ts` — finalize onSuccess: only seed
  hydrated cache; keep the refetch
- `src/hooks/useElevesMutations.ts` — create/update/delete now keep
  useAllEleves cache in sync (with same "only seed if hydrated"
  guard on the add path)

## Test

1. Apply zip, hard refresh
2. **Fresh scenario (cold cache)**: go directly to Inscriptions →
   Guichet without visiting Finances first. Finalize a new student.
   Navigate to Finances → pick their destination class → verify
   you see ALL students of that class, including the new one.
3. **Warm scenario**: visit Finances first (so the cache populates),
   then go to Guichet, finalize. Return to Finances → picker shows
   complete list with new student inserted at the right alphabetical
   position.
4. **Manual add**: Élèves tab → create new student → go to Finances
   → verify they appear in search + bilan includes them.
5. **Edit**: Élèves tab → rename a student → Finances search with
   their new name → verify they appear (the update now propagates).
6. **Delete**: Élèves tab → delete a student → Finances search by
   their name → verify they don't appear anymore.

## What wasn't changed

- No rules changes
- Class-scoped `useEleves(classeId)` still drives the admin Élèves
  tab via onSnapshot; unaffected by this patch
- The paiements cache seed (previous patch) is intact
