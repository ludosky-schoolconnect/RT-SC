# Phase 6c — Public pre-inscription form

## What this phase ships

The public-facing parent portal at `/inscription`. Unauthenticated,
mobile-first, works on any phone without installing anything.

Two modes accessible via segmented toggle at the top:

1. **Soumettre un dossier** — full form: élève identity + parent
   contact + (optional) category + documents. On submit, creates the
   `pre_inscriptions` doc and uploads compressed documents to the
   subcollection. Shows a prominent success screen with the generated
   tracking code + copy button.

2. **Suivre mon dossier** — parent enters tracking code, sees:
   - *En attente* → soft waiting message
   - *Approuvé* → RV date prominent + "Reprogrammer" button (cap 3)
   - *Refusé* → reason displayed
   - *Inscrit Officiellement* → welcome banner

All logic reuses the Phase 6b data layer (hooks, libs, types) — the
admin and public sides share the same RV algorithm, same compression
pipeline, same atomic counter, same reprogram cap.

## Architecture decisions

### Unauth route — safe by design

The Firestore rules from Phase 6b already permit `create: true` and
`read: true` on `pre_inscriptions`. No writes allowed by unauth users
except creating the doc + subcollection documents (no update, no
delete — those require `isStaff()`).

The tracking code (`SC-XXXXXX`) is the de-facto authorization. Any
parent can technically read any dossier by knowing its code, but the
code is 6 random alphanumeric chars = ~36⁶ = 2.2 billion combinations.
Guessing is not a realistic attack. This matches legacy behavior
exactly.

### Why not require auth?

- Parents in Bénin often don't have Gmail/Facebook accounts, or can't
  easily remember credentials. Forcing auth creates a huge drop-off.
- The "submit once, come back with code" pattern has worked in legacy
  for years.
- Parents don't write data they shouldn't. They can only *create*
  their own dossier and *read* a dossier whose code they have.

### Form progressive disclosure

The form is a single scrollable screen, not a multi-step wizard.
Reasoning:
- Parents on mobile want to see the whole form at once. Multi-step
  wizards feel heavy.
- Validation happens at submit time, with a clear summary of what's
  missing.
- If admin configured categories, the documents section is hidden
  until parent picks a category (no point showing empty boxes).

### Documents section adapts to admin config

The `getDocsForCategory(settings, category)` helper (Phase 6b)
returns the right doc list based on:
- Mode = categorized → returns `settings.categories[x].documents`
- Mode = simple → returns `settings.documentsSimple`

The form reads this live from Firestore via `useSettingsInscription`.
Admin edits the config → public form updates on next page load.

### Upload progression with real feedback

Three stages during submit:
1. "Compression des images…" with count progress
2. "Envoi du dossier…" (single-step) — creates the main inscription doc
3. "Envoi des documents…" with count progress — uploads each doc

Progress bar updates after each step. If compression fails for one
file (too large even after compression, bad format), submit aborts
with a French error naming the file. Parent can adjust and retry.

### Tracking panel uses same mutation as admin

`useReprogrammerRV` is called from BOTH:
- Admin side (RendezVousView row button)
- Parent side (tracking panel button)

Same algorithm. Same 3-cap enforcement. Same atomic counter
increment. The server-side math is consistent regardless of who
triggers the reschedule. This is important because admin and parent
might try to reschedule concurrently — the atomic Firestore counter
prevents double-claiming a slot.

### Status badge design

Each statut gets:
- A color variant (success/warning/danger/neutral)
- An icon (CheckCircle2/Clock/XCircle/GraduationCap)
- A short label

Body content changes per statut:
- *En attente* → minimal (parents don't need details yet)
- *Approuvé* → prominent date + reprogram + checklist
- *Refusé* → reason displayed + contact invite
- *Inscrit Officiellement* → welcome + "use your credentials"

### Mobile-first considerations

- Every tap target ≥44×44px (WCAG minimum)
- Single-column layout always (no responsive 2-col tricks)
- Form inputs use appropriate `inputMode` (tel, numeric, date)
- File input hidden visually but reachable via label tap
- Date max = today (prevents impossible future birthdates)
- Capitalization hints (`autoCapitalize="words"` on name)
- Error messages in French, never technical

## Files

### New (Phase 6c)
- `src/routes/inscription/InscriptionPage.tsx` — main page with mode
  switcher
- `src/routes/inscription/InscriptionFormPanel.tsx` — form + upload +
  success screen
- `src/routes/inscription/InscriptionTrackingPanel.tsx` — lookup +
  status-specific bodies + parent-side reprogrammer

### Modified
- (None — the placeholder `InscriptionPage.tsx` was replaced, route
  wiring in `App.tsx` already existed)

### Reused from Phase 6b
- `usePreInscriptions` → `findInscriptionByTrackingCode`,
  `useReprogrammerRV`
- `useSettingsInscription` → config + `getDocsForCategory`
- `inscription-doc-storage.ts` → `prepareDoc`, `uploadPreparedDoc`
- `inscription-rdv.ts` → `REPROG_MAX`, `DEFAULT_PLACES_PAR_JOUR`
- `benin.ts` → `genererTrackingCode`

## Firestore rules — no changes needed

Your rules already permit everything the public form needs:

```
match /pre_inscriptions/{piId} {
  allow create: if true;                        // form submit
  allow read: if true;                          // tracking lookup
  match /documents/{docId} {
    allow create: if true;                      // document upload
    allow read, write: if isStaff();            // admin only
  }
}
match /settings_inscription/config {
  allow read: if true;                          // form needs the config
}
match /rv_counters/{date} {
  allow read, write: if true;                   // parent reprogrammer
}
```

For reprogrammation specifically, the public form writes to
`/pre_inscriptions/{id}` directly (to update `dateRV` +
`reprogCount`). Your rules currently allow this via the unauth-friendly
`allow update: if true` line… wait, let me re-read them:

```
match /pre_inscriptions/{piId} {
  allow update, delete: if isStaff();
}
```

Hmm. Reprogrammation from the public form will fail with this rule
because the parent is unauth. **This is a real issue.**

Options:
1. **Loosen the rule to allow updating specific fields unauth** — risky
2. **Require the update to only touch `dateRV` + `reprogCount`** —
   safer, using field-level Firestore rules
3. **Move reprogrammation server-side via a Cloud Function** — safest,
   but adds infrastructure

**Recommended rule update**:

```
match /pre_inscriptions/{piId} {
  allow create: if true;
  allow read: if true;
  allow update: if isStaff() || (
    // Allow ONLY updates to dateRV + reprogCount fields, from anyone
    // who knows the tracking code (enforced by the lookup flow)
    request.resource.data.diff(resource.data).affectedKeys()
      .hasOnly(['dateRV', 'reprogCount']) &&
    // And only when the existing statut is 'Approuvé' (can't un-refuse
    // or re-open a finalized dossier by spoofing a reprogrammation)
    resource.data.statut == 'Approuvé' &&
    // And only if the new reprogCount is exactly old + 1 (prevents
    // just setting it back to 0 to skip the cap)
    request.resource.data.reprogCount == resource.data.reprogCount + 1
  );
  allow delete: if isStaff();
  ...
}
```

This allows parent-side reprogrammer to work while keeping every other
field protected. Please deploy this updated rule before testing 6c's
reprogram flow — otherwise parents will see "Erreur: Permission
denied" when they click the button.

## What's NOT in this phase

- **Email/SMS notifications when statut changes** — parent has to
  come back and check. WhatsApp notifications from admin side are
  manual (via the WhatsApp link button in RendezVousView).
- **Multi-language (i18n)** — form is French-only. Béninois schools
  operate in French.
- **Photo of the élève directly from camera** — the `<input type="file">`
  with `accept="image/*"` lets parents pick from gallery OR take a
  photo. No custom camera UI.
- **Re-upload a document after refusal** — if a dossier is refused
  for missing/bad docs, parent has to submit a brand-new dossier
  (new tracking code). We don't support "edit and resubmit". Keeps
  the state machine simple.
- **Browser back button on success screen** — success screen clears
  the form on mount, so hitting back shows an empty form ready for
  another child. Intentional (some parents submit for multiple
  kids).

## Test priorities

1. **Anonymous access** — open `/inscription` in incognito window
   (not logged in). Page should load without redirect.

2. **Empty form submit** — hit "Soumettre" with nothing filled. Should
   show the yellow "Complétez le formulaire" box listing missing
   fields. No network call.

3. **Category flow** — if admin configured categories, verify the
   picker appears and document list adapts. Switch categories →
   document list swaps.

4. **Image upload + compression** — pick a large phone photo
   (4-10MB). Submit. Progress bar shows compression. No error. Check
   Firestore → the document dataUrl should be <900KB.

5. **PDF upload** — pick a PDF. Should upload as-is (no compression
   attempted). If PDF is >900KB, should fail with French error
   naming the file.

6. **Tracking lookup — En attente** — search with the code you just
   got. Should see Clock icon + "en cours de traitement".

7. **Tracking lookup — Approuvé** — approve the dossier from admin.
   Go back to public tracking, search again → should see the RV date
   prominently + "Reprogrammer" button + "3 reprogrammations
   restantes".

8. **Parent reprogrammer** — click "Reprogrammer mon rendez-vous" →
   should fetch a new date + show "✓ Date mise à jour" message. The
   old day's counter decrements (check Firebase console
   `/rv_counters`).

   **⚠️ This will fail with permission-denied UNTIL you update the
   Firestore rules as described above.**

9. **Reprogrammation cap** — do it 3 times. On the 4th attempt,
   button should be disabled with explanatory text.

10. **Tracking lookup — Refusé** — refuse a dossier from admin with a
    reason. Public lookup should show the reason in red.

11. **Tracking lookup — Inscrit** — finalize a dossier at the guichet.
    Public lookup should show the welcome screen.

## One critical next step

**Before testing reprogrammation, update the Firestore rule for
`/pre_inscriptions` as described in the "Firestore rules" section
above.** Without it, parents will get a permission error when
clicking reprogrammer.

If you'd rather defer this and not ship parent-side reprogrammation
yet (keeping it admin-only for now), tell me and I'll add a simple
feature flag that hides the button until the rule is deployed.
