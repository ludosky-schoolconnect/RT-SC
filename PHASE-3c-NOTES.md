# RT-SC · Phase 3c — Profs Tab

The third admin tab is now fully functional. You can manage every professeur in the school — approve new requests, assign classes, edit matières, regenerate the school-wide signup code, and remove profs.

## What's new

| Area | Status |
|---|---|
| Profs tab | **Fully functional** |
| Passkey-prof panel | New — the legacy app required editing Firebase Console |
| Pending approvals | One-tap approve / reject with confirm |
| Active profs list | Search + responsive table/cards |
| Assign classes modal | Bidirectional sync (prof ↔ classes) with select-all helpers |
| Prof detail modal | Edit matières + danger-zone removal |
| Live updates | Multi-admin safe — changes from other devices appear instantly |

## Behaviors preserved from the legacy app

- **Approve** = sets `statut: 'actif'` on the prof doc — the en-attente screen they're on auto-redirects to the dashboard
- **Reject** = deletes the prof doc (the Firebase Auth account itself stays — same as legacy; rejected users could re-signup if they know the passkey)
- **Bidirectional class sync** — assigning prof to a class updates both `professeurs/{uid}.classesIds` AND `classes/{id}.professeursIds`
- **Admins hidden** from the prof management list
- **Delete** removes the prof from all their classes' `professeursIds` arrays before deleting the doc

## What's better than legacy

- **Passkey-prof panel surfaces the school signup code** — admins can see, copy (to share via WhatsApp/SMS), and rotate it directly from the UI. The legacy app required Firebase Console access.
- **Live snapshots** — if you're viewing this tab and another admin approves a prof from a different device, your screen updates instantly
- **Optimistic mutations** with rollback on error — UI flips immediately
- **Search** by nom, email, or matière
- **Select-all / deselect-all** in the assign-classes modal
- **Visual confirm modals** instead of the legacy `customConfirm` divs
- **Class assignment grouped by cycle** in the modal for easier scanning
- **Stats strip** at the top — total / actifs / en attente

## What to test

After applying the patch and restarting the dev server:

1. Log in as admin → tap **Profs** tab
2. **Passkey panel** at the top:
   - Should show the current `passkeyProf` (or "Aucun code défini" if `ecole/securite` doesn't exist yet)
   - Tap the copy icon — toast confirms
   - Tap "Régénérer le code" — confirms first, then shows the new value
3. **Pending requests** (only appears if there are profs with `statut: 'en_attente'`):
   - Tap the green ✓ → confirms approve → row animates out, badge updates on Stats strip
   - Tap the red ✕ → confirms reject → row removed
4. **To create a pending request for testing**: log out, navigate to `/auth/prof`, switch to Inscription tab, sign up with a new email + the current `passkeyProf`. You should land on the en-attente screen. Switch back to admin in another tab/window and see the new request.
5. **Active profs list** — tap any row → detail modal opens showing assigned classes as badges and an editable matières field
6. **In the detail modal** — tap "Modifier" next to "Classes assignées" → the assign-classes modal opens
7. **In the assign modal** — toggle classes, use Tout sélectionner / Tout désélectionner, save. The bidirectional sync updates `classes/{id}.professeursIds` automatically.
8. **Verify the bidirectional sync** — go back to the Classes tab, tap any class you assigned, and the `professeursIds` change is reflected (will be visible once the class detail shows assigned profs in a future phase, but you can verify in Firebase Console for now).
9. **Try the danger zone** in the prof detail modal — confirms then removes the prof and cleans up class references
10. **Search** — try filtering by partial nom, email, or matière

## Test the en-attente auto-redirect

- Open two browser windows side by side (or admin on phone + prof on desktop)
- In one window: log in as a brand-new prof, land on the en-attente screen
- In the other window: log in as admin, go to Profs tab, approve them
- The prof's en-attente screen should auto-redirect to the prof dashboard within ~1 second (live snapshot of their profil triggers the redirect)

## Notes

- Reject leaves the Firebase Auth account intact. To fully ban an email, you'd need to delete the account in Firebase Console. Same as legacy — defer this to a future phase if needed.
- Delete operates the same way — only removes the prof doc and cleans class references, not the Auth account.
- Profs with `role === 'admin'` are not shown in this tab. Admin role management lives in Phase 3d (Année tab) along with school identity.
- Class assignment writes happen sequentially across affected classes. Acceptable for typical school size (10–30 classes per prof). For very large institutions we'd switch to a batched write — easy to upgrade later.

## What's NOT in Phase 3c

- Setting "Professeur Principal" per class — the mutation `useSetProfPrincipal` exists in the hook but no UI yet. Will live in Phase 3d's class-detail or Phase 4 (Notes & Bulletins) where it's actually needed.
- Promoting an existing prof to admin — Phase 3d.
- CSV/Excel export of the prof list — easy to add later if you want.
- Bulk approve — intentionally avoided (each approval should be a deliberate action).

## Coming next

**Phase 3d** — Final admin sub-phase:
- Année tab: set `anneeActive`, edit school identity (`nom`, `ville`, `devise`), bulletin config (Trimestre/Semestre, base conduite), danger zone with rollover modal that archives the year
- À propos CMS editor (UID-gated to your developer account, lives at a hidden admin route)
- Optional admin-tab settings: matières globales editor, coefficients grid editor

After 3d, the admin dashboard is **complete** and we move on to Phase 4 (Notes & Bulletins).
