# Fix patch — new élève not appearing in terminal de caisse / class roster

## The bug

After a successful guichet finalize, the student didn't appear in
- the terminal de caisse (Finances search)
- the class roster (Élèves tab, picking the destination class)

...even though:
- The receipt printed correctly (paiement was written)
- Parent space showed "Inscrit Officiellement" (pre_inscription doc
  was updated)
- "Later on", the student appeared

So the DATA was correct in Firestore. The UI just didn't know about
it right away.

## Root cause — `useAllEleves` race

`useAllEleves` is a **one-shot `getDocs` query with 5-min staleTime**
(NOT a snapshot listener). This was an intentional design decision:
running N snapshot listeners for N classes school-wide would be
expensive, and school rosters don't change mid-session frequently.

The finalize flow called `qc.invalidateQueries({ queryKey: ['eleves',
'all'] })`. But **invalidation alone doesn't refetch** if nothing's
currently subscribed to that query. It just marks the cache stale.

Sequence that produced the bug:
1. Admin is on Inscriptions → Guichet (no useAllEleves consumer here)
2. Admin clicks finalize
3. Élève + paiement written, pre_inscription closed
4. `onSuccess` runs `invalidateQueries(['eleves', 'all'])` — marks
   stale, but nothing's subscribed, so no refetch happens
5. Admin navigates to Finances → search
6. `useAllEleves` mounts, sees stale cache, refetches
7. BUT — if Firestore's cache layer still shows pre-write state for
   a brief window (pending write race on mobile), the refetch can
   return stale data
8. User sees "no such student"
9. "Later" — another useAllEleves remount hits the freshly-
   consistent server state, and the student appears

## Fix — two-part

### 1. Optimistic seed

Immediately after finalize succeeds, write the new élève into the
local TanStack cache for `['eleves', 'all']` with dedup guard. If
admin navigates to Finances even a millisecond later, the student
is already in the list (no Firestore round-trip needed).

```ts
const next = [...cached, optimisticEntry].sort(...)
qc.setQueryData(['eleves', 'all'], next)
```

### 2. Force-refetch instead of invalidate

Swapped `invalidateQueries` for `refetchQueries` on the
`['eleves', 'all']` key. `refetchQueries` actively kicks off the
query function immediately — even if nothing is currently
subscribed, it creates a short-lived query job that repopulates
the cache with the server-confirmed view.

```ts
void qc.refetchQueries({ queryKey: ['eleves', 'all'] })
```

The two fixes are complementary:
- Seed guarantees immediate visibility in the current session state
- Refetch guarantees cache consistency with the server within a few
  hundred ms (overwrites the optimistic seed with real data)

### What wasn't changed

- Class roster (`useEleves(classeId)`) — uses onSnapshot listener.
  The new élève appears automatically when admin navigates to the
  destination class. No race here.
- Paiements — the previous patch already pre-seeded `['paiements',
  classeId, eleveId]` with a synthetic entry. Untouched.

## Files changed

- `src/hooks/usePreInscriptions.ts` — `useFinalizeInscription` onSuccess
  now does optimistic seed + refetch on `['eleves', 'all']`

## Test

1. Apply zip, hard refresh
2. Approve a fresh pre-inscription with a tracking code
3. Go directly to Inscriptions → Guichet (don't visit Finances
   first — we want the cold cache case)
4. Enter the tracking code, montant, click Finaliser
5. Receipt prints, credentials modal shows
6. Close modal, go to Finances → search
7. Verify the student appears IMMEDIATELY, with the correct paid
   amount and "Soldé" / "Partiel" badge

Also test:
8. Go to Élèves tab → pick the destination class → verify the new
   student appears in the roster (snapshot listener; no special
   handling needed but worth confirming)

## What's NOT in this patch

- No rules changes
- No changes to the guichet receipt flow (still snapshot-correct
  from previous patch)
- No changes to absence / EDT / quota logic
