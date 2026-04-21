# Phase 6b — Pre-inscriptions admin + guichet d'admission

## What this phase ships

The full inscription back-office that turns "parent fills a form
somewhere" into "registered élève in a class with credentials". Three
linked surfaces:

1. **Demandes** — pending pre-inscriptions awaiting triage (approve /
   refuse / delete)
2. **Rendez-vous** — approved dossiers grouped by physical-visit date,
   with WhatsApp reminder + reprogram capability
3. **Guichet** — caissier search-by-tracking-code → cash collection →
   atomic finalize (creates real élève + records paiement + closes
   dossier + cleans up documents)

Plus an admin-side editor for what the public form requires (Phase 6c
will ship the public form itself).

**Caissier role**: NOT a separate auth role yet. Per our design
discussion: head admin == caissier for now. When you sell to a school
that needs role separation, the surfaces (`InscriptionsAdminTab`,
`FinancesAdminTab`) are already self-contained and can be re-mounted
under a stripped-down caissier dashboard. Today's admin uses both.

## Architecture decisions

### The three improvements over legacy document storage

Legacy stored all uploaded documents as base64 inside the parent
`pre_inscriptions/{id}.documents` map. This works but has problems:
1MB doc limit forces aggressive size caps (with 4 docs per category,
each gets only 187KB), every list query pulls all the file data,
nothing ever gets cleaned up.

**Three improvements shipped here**:

1. **Client-side image compression** — `lib/inscription-doc-storage.ts`
   uses canvas to resize images to max 1600px and re-encode as JPEG
   q0.7 before upload. Typical 4MB phone photo → ~200KB. PDF passes
   through (already compressed format).

2. **Per-document subcollection** — `/pre_inscriptions/{id}/documents/{slug}`
   instead of a map field on the parent doc. Each upload is its own
   ~1MB envelope, parent doc stays light, listing query doesn't pull
   file data unless requested. The viewer modal (`ModalDocumentsViewer`)
   lazy-loads via `fetchPreInscriptionDocs`.

3. **Post-finalize cleanup** — `useFinalizeInscription` calls
   `deleteAllDocsForInscription` (non-blocking) after promotion.
   Long-term DB stays trim. The pre_inscription doc itself stays
   (with statut "Inscrit Officiellement") so tracking lookups still
   work, but the heavy file payload is gone.

The `ModalDocumentsViewer` reads from BOTH the new subcollection AND
the legacy embedded `documents` map. Backward-compatible.

Per-doc cap stays at ~900KB (leaves headroom under Firestore's 1MB
hard limit for metadata + base64 overhead). If a compressed file
still exceeds, prepareDoc throws a French error message naming the
specific document.

### Settings inscription — categorical vs flat editor

Replaces legacy magic-string syntax (`[Category]` markers,
`*required*` / `"optional"` quoting) with a real visual editor.

Two modes the admin can switch between:
- **Liste simple** — flat document checklist (no category picker on
  the public form)
- **Catégories** — multiple applicant profiles ("Nouveaux élèves",
  "Anciens élèves") each with their own checklist. Public form asks
  the parent which category they belong to first, then shows the
  matching docs.

Each doc has a per-row "Requis" toggle (replaces `*name*` syntax).
Categories collapse/expand. Add/remove buttons everywhere.

**Backward compat**: `useSettingsInscription` auto-migrates legacy
`documents: string[]` data on read. The legacy field stays in
Firestore until admin saves the new shape (then it's cleared via
explicit `null`). No migration button needed — invisible upgrade.

### RV slot algorithm — preserved + made configurable

Legacy hardcoded:
- 35 places per day
- Today + 3 days minimum
- Skip Sat/Sun
- Max 30 attempts to find a slot

All four are now configurable via `SettingsInscription`:
- `rendezVousPlacesParJour` (default 35)
- `rendezVousDelaiMinJours` (default 3)
- (max attempts kept as code constant — no operational reason to
  expose)

Atomic counter increment uses Firestore's server-side `increment(1)`
so two concurrent submissions can't both grab the last slot.

### Reprogrammation — capped at 3 per dossier

Legacy had no cap — a parent could reprogram 50 times. We added
`REPROG_MAX = 3` in `lib/inscription-rdv.ts`. Reasoning:

- After 3 reschedules, parent likely needs a phone call with the
  school anyway (special circumstances, transport problem, etc.)
- Removes a no-show abuse surface (parent could indefinitely defer
  showing up while the slot stays "approved" forever)
- The cap is per-dossier (`reprogCount` on the doc), survives across
  sessions, increments atomically

Admin can also reprogram from the RV view (same algorithm, also
counts toward the cap). When deleting an inscription, the RV slot
is released (best-effort `releaseSlot`). When reprogramming, the old
slot is released THEN the new one is taken — net zero on the system,
parent just shifted to a different day.

### Finalize is atomic-ish

`useFinalizeInscription` runs four steps in order:
1. Re-fetch the dossier (concurrency check — rejects if statut
   changed since admin opened the modal)
2. `addDoc` to create the live élève (auto codePin + passkeyParent)
3. `addDoc` to record the paiement in their subcollection
4. `updateDoc` to set inscription statut → "Inscrit Officiellement"
5. (Non-blocking) wipe the documents subcollection

If step 2 fails, nothing is written. If step 3 fails, the élève
exists but no paiement — admin sees the error and can manually
record the paiement. If step 4 fails, élève + paiement exist but
inscription stays "Approuvé" — re-running finalize is safe (concurrency
check catches the duplicate).

The order is deliberate: élève FIRST so we have its ID for paiement.
Paiement BEFORE inscription closure so admin doesn't accidentally
close a dossier with no recorded payment.

**Credentials shown after success**: codePin (élève login) +
passkeyParent (parent dashboard access). Caissier writes them on the
receipt and hands them to the parent. The credentials modal also has
a "Imprimer le reçu" button that generates the same A4 duplex
receipt PDF used in Finances.

## Files

### New (Phase 6b)

**Types/keys/lib**
- `src/types/models.ts` — extends `PreInscription` (adds `classeCible`,
  `reprogCount`, marks `documents` optional/legacy), adds
  `PreInscriptionDocument` for new shape, rewrites `SettingsInscription`
  with `categories[]` + `documentsSimple[]` + RV config (legacy
  `documents: string[]` kept for back-compat read), adds `RvCounter`
- `src/lib/firestore-keys.ts` — adds `preInscriptionDocsCol` +
  `preInscriptionDocDoc` + `rvCounterDoc`
- `src/lib/inscription-rdv.ts` — pure RV math (find next slot, release
  slot, parse/format DD/MM/YYYY, weekend skip, atomic counter via
  Firestore `increment()`)
- `src/lib/inscription-doc-storage.ts` — image compression, per-doc
  upload, lazy fetch, post-finalize cleanup

**Hooks**
- `src/hooks/useSettingsInscription.ts` — config hook with **automatic
  legacy migration** (parses old `documents: string[]` magic-string
  format on read; preserved on disk until admin saves new shape)
- `src/hooks/usePreInscriptions.ts` — live snapshot + 5 mutations
  (approve, refuse, reprogrammer, delete, finalize) + lookup helper
  `findInscriptionByTrackingCode`

**UI**
- `src/routes/admin/tabs/inscriptions/InscriptionsAdminTab.tsx` —
  main surface with mode switcher (Demandes / Rendez-vous / Guichet),
  shows live counts on each tab button
- `src/routes/admin/tabs/inscriptions/DemandesView.tsx` — pending
  list, per-row Documents/Refuser/Approuver/Supprimer actions
- `src/routes/admin/tabs/inscriptions/RendezVousView.tsx` — approved
  dossiers grouped by date, expand/collapse cards, today highlighted,
  past dates separately collapsed (no-shows)
- `src/routes/admin/tabs/inscriptions/GuichetView.tsx` — caissier
  search by tracking code → cible display → payment input → finalize
  → credentials modal with copy + print buttons
- `src/routes/admin/tabs/inscriptions/ModalApprouverInscription.tsx`
  — three-step (pick class → computing RV → done) with class filter
  by niveau souhaité
- `src/routes/admin/tabs/inscriptions/ModalRefuserInscription.tsx` —
  reason required (min 5 chars), shown to parent on tracking lookup
- `src/routes/admin/tabs/inscriptions/ModalDocumentsViewer.tsx` —
  lazy-load + image preview + PDF "Ouvrir"
- `src/routes/admin/tabs/inscriptions/SettingsInscriptionCard.tsx` —
  visual editor (mode toggle: simple/categorized + materiel + RV
  config)

### Modified
- `src/routes/admin/AdminDashboard.tsx` — adds Inscriptions tile to
  Plus menu (placed first, since admissions are time-sensitive)
- `src/routes/admin/tabs/annee/AnneeTab.tsx` — adds new section
  "Pré-inscriptions" containing the SettingsInscriptionCard

## Firestore rules

You probably already have most of these from earlier phases. Verify:

```
match /pre_inscriptions/{piId} {
  // Public form needs to create + parent needs to read by tracking code.
  // Admin needs everything.
  allow create: if true;                          // public form
  allow read: if true;                            // tracking lookup
  allow update, delete: if isStaff();             // admin only

  match /documents/{docId} {
    allow create: if true;                        // public form uploads
    allow read, write: if isStaff();              // admin views/cleans
  }
}

match /settings_inscription/config {
  allow read: if true;                            // public form needs requirements
  allow write: if isStaff();
}

match /rv_counters/{date} {
  // Public form increments via reprogrammation; admin reads via approval
  allow read: if true;
  allow write: if true;                           // server-side increment is atomic
}
```

`true` on `read` for `pre_inscriptions` and `settings_inscription` is
intentional — Phase 6c (public form) needs unauth access. The tracking
code is the de-facto authorization (you can only see a dossier if you
know its 6-character random code).

If you want stricter rules for the rv_counters write (currently allows
any client to increment), wait until Phase 6c is shipped — then we can
add a Cloud Function to gate it server-side. For now, the only writers
are the legitimate flows.

## What's NOT in this phase

- **Public form** (Phase 6c) — the parent-facing `/inscription` route
  with file upload, tracking lookup, parent-side reprogrammer
- **Phone normalization** — contactParent is taken as-is. WhatsApp
  link strips non-digits but doesn't validate. If you want full E.164
  validation (+229 format etc.), we can add it later.
- **Bulk approval** — one-by-one only. Could add multi-select if your
  daily volume justifies.
- **Approval audit log** — who approved/refused which dossier when
  isn't tracked. Add later if compliance requires.
- **Email notification** — parents currently learn the dossier status
  by checking the public form. No email/SMS push. WhatsApp is
  encouraged via the manual link.
- **Photo of the élève** — not requested in legacy. If parents should
  upload a photo, add it as a new document spec in the settings
  editor.

## Test priorities

1. **Configure required documents** — Année tab → "Pré-inscriptions"
   section → Settings card → enable "Catégories" mode → add "Nouveaux
   élèves" with 2 docs (Acte de naissance, Photo) → save.
   Then enable "Liste simple" → add 1 doc → save → confirm switching
   modes preserves separately.

2. **Configure RV slots** — set 5 places/jour + délai 2 jours → save.

3. **Manually create a test pre_inscription** — until Phase 6c ships,
   you can test by adding a doc via Firebase console with
   `{nom, genre, date_naissance, niveauSouhaite, contactParent,
   trackingCode: 'SC-TEST1', dateSoumission: now, statut: 'En attente'}`.

4. **Demandes view** — Plus → Inscriptions → see your test dossier in
   "Demandes (1)". Click "Documents" → empty (no upload yet). Click
   "Approuver" → modal with class picker filtered to matching niveau.
   Pick class → "Approuver & fixer le RV" → see auto-calculated date.

5. **Rendez-vous view** — switch tab → see your dossier under its RV
   date. Click WhatsApp → opens wa.me with pre-filled message.

6. **Reprogrammer** — click reprogrammer on the RV row → confirm →
   should jump to next available date (with "1 sur 3" attempt
   indicator), old day's counter decrements.

7. **Try reprogramming 3 times** → on the 4th, button should be
   disabled with reason.

8. **Guichet** — switch tab → type the tracking code → "Chercher" →
   dossier appears with cible (calc'd from finance config + class
   niveau + gratuité). Set montant >= cible → "Valider & inscrire"
   → success modal with codePin + passkeyParent → "Imprimer le reçu"
   downloads PDF.

9. **Verify finalization** — Élèves tab → the assigned class should
   now contain the new élève. Finances tab → search them → 1
   paiement of the cible amount, marked "Première inscription".

10. **Verify cleanup** — Plus → Inscriptions → Demandes is empty (the
    dossier is now "Inscrit Officiellement" — not in any of the 3
    views). The pre_inscription doc still exists (parent can still
    track via code), but the documents subcollection should be empty.

11. **Refuse another test dossier** — type 5+ char reason → confirm →
    dossier disappears from Demandes (statut = Refusé). Public form
    tracking lookup will show the reason in Phase 6c.
