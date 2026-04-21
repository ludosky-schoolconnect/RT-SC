# Fix patch — guichet receipt + finances refresh + copy sweep

Three related fixes plus rules consolidation.

## 1. Guichet receipt showing 0F — fixed

### Bug
After a successful finalize at the guichet, the "Imprimer le reçu"
button produced a PDF with `0 F` as the amount. The problem: the
`handleFinalize` function successfully finalized, then IMMEDIATELY
cleared the local state (`setMontantStr('')`, `setMethode('')`) to
ready the surface for the next visitor — before the credentials modal
(with its "Imprimer le reçu" button) had a chance to be used.

When the user clicked "Imprimer", `handlePrintReceipt` read `montant`
and `methode` from the now-empty state. Result: 0 F, no method.

### Fix
`GuichetView` now snapshots the finalize payload into a dedicated
`finalizedSnapshot` state at the moment finalize succeeds:

```ts
setFinalizedSnapshot({
  montant,
  methode: methode.trim(),
  caissier,
  date: new Date(),
})
```

The receipt PDF reads from this snapshot, not the form state. The
form state is still cleared for the next visitor — but the snapshot
survives until the user closes the credentials modal.

## 2. Terminal de caisse / bilan showing 0 after finalize — fixed

### Bug
Right after finalize, the freshly-registered élève's row in the
Finances tab showed "Aucun paiement" with `0 / 65000 F` balance. The
paiement WAS correctly written to Firestore — but the
`useElevePaiements` snapshot listener took ~500ms-2s to receive the
server-resolved `serverTimestamp()` and populate the local cache.
Users perceived "nothing happened".

### Fix
`useFinalizeInscription`'s `onSuccess` now pre-seeds the TanStack
Query cache for the new élève's paiements key with a synthetic
entry built from the known input:

```ts
qc.setQueryData(['paiements', classeCible, eleveId], [
  {
    id: paiementRef.id,
    montant: vars.montant,
    date: { toDate: () => new Date() },  // duck-typed Timestamp
    caissier: vars.caissier,
    ...
  }
])
```

When the real Firestore snapshot listener fires a moment later, it
overwrites the synthetic with the server-confirmed version (via its
own `setQueryData` in `useElevePaiements`). No lasting consistency
risk — just a bridge over the ~500ms gap.

Result: Terminal de caisse row shows the correct balance
INSTANTLY after finalize, not after a 1-second wait.

## 3. "Suivre la scolarité" → "Suivre le parcours de votre enfant"

Two files:
- `InscriptionTrackingPanel.tsx` — the welcome banner shown to
  parents after their dossier is officially finalized.
- `ParentLogin.tsx` — the parent login screen subtitle.

Both now say "le parcours de votre enfant" instead of "la scolarité".
Friendlier, more specific to what parents actually want to track
(attendance + grades + announcements, not just tuition).

If you spot other places with similar copy (élève dashboard, parent
dashboard, email templates, etc.), call them out and I'll sweep
those too.

## 4. Firestore rules — consolidated + rebalanced

Several improvements vs your current rules:

### Dropped 06h-18h window on absences (Option A)
Client-side checks (quota + verrouToday + emploi du temps) are now
comprehensive enough to replace the blunt time guard. Parents can
declare at 22h after work.

### Parent-side reprogrammer permission
`/pre_inscriptions/{piId}` now allows unauth updates, but ONLY when:
- Only `dateRV` + `reprogCount` fields are touched
- Existing statut is `'Approuvé'`
- `reprogCount` increments by exactly +1

Prevents any creative bypassing of the 3-cap or modification of
other fields.

### rv_counters writable unauth
Parent reprogrammer decrements old day + increments new day. Counter
docs are just integers with no sensitive data. The value-space
protection for the cap is enforced on the pre_inscriptions rule
above.

### archive/{annee} delete now allowed
Previously `allow delete: if false`. The admin "Supprimer cette
archive" action in the Année tab has been failing. Changed to
`isStaff()` so the button works. This is necessary if admin needs
to re-run a botched rollover on the same année.

### Consolidated duplicate blocks
Your rules had `/pre_inscriptions/{piId}` twice and `/rv_counters/{date}`
twice with conflicting permissions. The looser rule would win in
some cases, stricter in others — unpredictable. Now each collection
has one authoritative block.

### Everything else preserved
- collectionGroup reads
- Handshake zone (élève/parent session claiming)
- Private subcollections (paiements/notes/bulletins/colles stay
  staff-write + student/parent-read)
- annuaire_parents two-chair lock
- cms (your UID-gated)
- professeurs (admin-approval flow)

## Files changed

- `src/hooks/usePreInscriptions.ts` — cache seeding after finalize
- `src/routes/admin/tabs/inscriptions/GuichetView.tsx` — snapshot
  finalize payload for receipt generation
- `src/routes/inscription/InscriptionTrackingPanel.tsx` — copy
- `src/routes/auth/ParentLogin.tsx` — copy

Rules file NOT included — you said you'll paste it yourself. Full
rules below in my message.

## Test

1. Apply zip, refresh app
2. Go to Plus → Inscriptions → Guichet, type a tracking code for
   an Approuvé dossier, enter cible amount, Validate
3. Success modal opens with credentials → click "Imprimer le reçu"
4. Verify PDF shows correct montant (not 0F) + method
5. Close modal, go to Finances → search the new élève by name
6. Verify balance shows paid amount IMMEDIATELY (not 0)
7. Go to `/inscription` while logged out, search tracking code for
   an Inscrit Officiellement dossier → verify welcome copy says
   "le parcours de votre enfant"
8. Log out, go to `/auth/parent` → verify subtitle copy
9. **Paste updated rules** in Firebase Console → deploy → test
   parent-side reprogrammer works (public form's tracking panel)
   and that absence declaration works at 22h
