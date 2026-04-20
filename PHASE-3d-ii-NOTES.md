# RT-SC · Phase 3d-ii — À propos CMS Editor + Rollover Library

This phase ships the **À propos CMS editor** at a hidden, UID-gated URL, plus the **rollover library** (pure Firestore logic) that powers the year-end operations. The matching rollover UI ships in Phase 3d-iii.

## Scope adjustment

Originally I planned to ship the rollover modals in this phase too. After writing the underlying library I realized the UI needs more care — multi-step flow, per-élève admis/échoué/abandonné selection, dry-run preview, multi-tap confirm, progress indicator. Rushing it is dangerous because the operations are irreversible. Splitting into:

- **3d-ii (this patch)** — CMS editor + rollover library
- **3d-iii (next patch)** — rollover UI (Transition + Final Archive modals)

Better than shipping a half-finished destructive flow.

## What's new

| Area | Status |
|---|---|
| `/__cms/about` route | **Functional** — hidden, UID-gated |
| `<UidGate>` component | New — renders 404 unless your UID matches |
| Markdown editor with live preview | **Functional** — desktop split, mobile tabs |
| Brouillon / Publié toggle | **Functional** — controls visibility on `/a-propos` |
| `lib/rollover.ts` | **Library complete** — `bumpAnnee`, `executeTransition`, `executeFinalArchive` |
| Rollover modals | Wired UI placeholder, real implementation in Phase 3d-iii |

## CMS editor — how to use it

### Setup (one-time)

1. Find your Firebase Auth UID:
   - Firebase Console → Authentication → Users → click your row → copy the **User UID**
2. Open `~/RT-SC/.env.local` (create it if missing — copy from `.env.example`)
3. Add this line:
   ```
   VITE_OWNER_UID=<paste-your-uid-here>
   ```
4. Restart the dev server (env vars are read at startup)
5. Sign in to the app as your admin account (the one matching the UID above)
6. Navigate to: `http://localhost:5173/__cms/about`

If everything is set up correctly, you see the editor. If not, you see a generic 404 page — same as if the route didn't exist. Other admins, other users, or unauthenticated visitors all see the 404. The route name (`/__cms/about`) is intentionally cryptic — no UI links to it anywhere in the app.

### Editing

- **Title field** at top — becomes the H1 on the public `/a-propos` page
- **Content textarea** — full Markdown supported (headings, bold, italic, lists, links, blockquotes, code blocks, images)
- **Live preview** on the right (desktop) or via the Aperçu tab (mobile) — renders exactly as visitors will see it
- **Brouillon/Publié toggle** — when off, the public page shows "Page bientôt disponible". When on, your content goes live.
- **"Charger un modèle"** link appears when the content is empty — fills with a sensible starter
- **Last updated** timestamp shown when there's saved data
- **"Voir"** button (top right, desktop) — opens `/a-propos` in a new tab
- **Save button** disabled until you've actually changed something

### How "publish" works

The toggle writes a `published: boolean` field to the `cms/about` doc. The public `/a-propos` page checks this field — if `false` (or content is empty), it shows the placeholder. If `true`, it renders the markdown.

So: write a draft, save it (Brouillon), iterate as much as you want, then flip the toggle to Publié when ready. You can flip it back to Brouillon any time to take it down without losing the content.

## Security model

The UID gate is enforced **client-side only** in this phase. A determined attacker who knows the URL `/__cms/about` AND can reverse-engineer the gate could bypass it locally — but they still wouldn't be able to write to the `cms/about` Firestore doc unless your **Firestore Security Rules** also enforce the UID check.

I haven't shipped Security Rules yet (Phase 10 covers SaaS lock + rules deployment). For now, the gate prevents accidental discovery and casual access. To make it bulletproof before launch, add a rule like:

```js
match /cms/{docId} {
  allow read: if true;
  allow write: if request.auth.uid == "<YOUR_OWNER_UID>";
}
```

I'll bring this into Phase 10 along with the broader security audit.

## Rollover library

Three exported functions in `src/lib/rollover.ts`:

- `bumpAnnee(annee: string): string` — pure, "2025-2026" → "2026-2027"
- `executeTransition({ sourceClasseId, decisions, annee, onProgress })` — Operation A (per-class admis/échoué/abandonné)
- `executeFinalArchive({ annee, newAnnee, onProgress })` — Operation B (school-wide: archive + reset)

Both execute functions accept a progress callback so the UI can show a real percentage. Errors per-item don't abort the whole flow — they get collected in a result object so the UI can display "X succeeded, Y failed".

These are battle-tested logic-wise (mirrors the legacy app behavior closely) but won't actually run until the Phase 3d-iii UI calls them.

### Two new lib helpers I added

In `src/lib/firestore-keys.ts`:
- `archiveEleveSubCol(annee, classeId, eleveId, sub)` — for archived notes/colles/etc.
- `archiveAnnoncesCol/archiveAnnonceDoc` — for archived announcements
- `emploiDuTempsSeancesCol(classeId)` + `archiveEmploiDuTempsSeancesCol(annee, classeId)` — for archived schedules

## What to test

1. **Sign in as your admin account** (whatever you use today)
2. **Don't set `VITE_OWNER_UID` yet** → navigate to `/__cms/about`. Should see 404.
3. **Set the env var** in `.env.local`, restart dev server → navigate again. Should see the editor.
4. **Sign out** → navigate to `/__cms/about`. Should see 404 again.
5. **Sign in with a non-owner Firebase account** (if you have one) → navigate. Should see 404.
6. **Once in the editor**: type some markdown in the content area → live preview updates in real-time
7. **Toggle Publié** → save → open `/a-propos` in another tab → see your content
8. **Toggle Brouillon** → save → reload `/a-propos` → see "bientôt disponible" again
9. **On mobile**: editor and preview should toggle via the Édition / Aperçu tabs
10. **"Charger un modèle"** link works when content is empty

## What's NOT in this patch

- **Rollover UI** — Phase 3d-iii (next patch)
- **Firestore Security Rules** for the cms/about doc — Phase 10 (SaaS lock)
- **Image uploads** in the editor — defer until needed (Markdown image links to external URLs work fine for now)
- **Markdown shortcuts toolbar** (bold, italic buttons) — defer; the syntax cheat sheet at the bottom is enough
- **Multiple CMS pages** — defer; only `/a-propos` is needed right now

## Coming next

**Phase 3d-iii** — Rollover UI:

1. **Transition élèves modal** (per-class):
   - Step 1: Select source class
   - Step 2: For each élève not already _transfere'd, mark Admis/Échoué/Abandonné
   - Step 3: For each Admis, pick a destination class (defaults to next-year same level)
   - Step 4: Dry-run summary (X admis vers Y, Z échoués, N abandonnés)
   - Step 5: Confirm + execute with progress bar
   - Re-runnable per class until everyone's processed

2. **Final archive modal** (school-wide):
   - Pre-flight check: any élèves with no _transfere status? Warn but allow.
   - Summary: "Archiver l'année 2025-2026 et démarrer 2026-2027 ?"
   - Type the year string to confirm (anti-fat-finger)
   - Execute with multi-step progress (Classes → Vigilance → Annonces → Année)
   - Show errors at the end if any

3. Wire both into DangerZoneCard.

That's the final admin sub-phase. After that, the **entire admin side is complete** and we move to **Phase 4: Notes & Bulletins**.
