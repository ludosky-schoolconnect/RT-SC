# RT-SC · Phase 3b — Élèves Tab

The second admin tab is now fully functional. You can manage every élève in every class — add, edit, delete, regenerate codes, view demographics, export rosters.

## What's new

| Area | Status |
|---|---|
| Élèves tab | **Fully functional** |
| Class selector | URL-driven (`?classe=xxx`), persists on refresh |
| Search | Client-side filter on nom |
| Demographics | Gender totals + age distribution pills |
| Vault codes panel | Collapsible — PIN + parent passkey for every élève with copy + per-élève regen |
| Excel/CSV exports | Roster + codes-only |
| Add élève modal | With duplicate check + auto-generated codes |
| Edit élève modal | With code preview + danger-zone delete |
| Virtualized list | Auto-engages when class has > 50 élèves |

## Behaviors preserved from the legacy app

- **Date of birth is mandatory** — same as legacy
- **Strict duplicate check** on `(nom, genre, date_naissance)`, case-insensitive — same as legacy
- **Auto-generated codes**: 6-char PIN from safe alphabet, `PRNT-XXXX-XXXX` parent passkey — same as legacy
- **Cascading delete**: removes notes, colles, absences, bulletins, paiements before deleting the élève — same as legacy
- **Demographics**: gender count + age distribution — same as legacy

## What's better than legacy

- **Live snapshots** — if you're on this tab and another admin adds an élève from a different device, your screen updates instantly without refresh
- **Optimistic mutations** — UI flips instantly, rolls back on error
- **Virtualized list** when > 50 élèves — buttery smooth scrolling on Android Chrome even with 200+ élèves
- **Search filter** on the roster
- **One-tap copy** on PIN and parent code in two places (vault + élève detail)
- **Per-élève regen** for PIN, parent code, or both — with confirm
- **Excel/CSV export** of the full roster
- **Excel/CSV export** of the codes only — perfect for printing labels to distribute
- **Duplicate check on edit** too (not just create) — prevents you from accidentally renaming one élève to match another existing élève
- **URL-driven class selector** — refreshing or sharing a link keeps you on the same class

## What to test

After applying the patch and restarting the dev server:

1. Log in as admin → tap **Élèves** tab (bottom nav on phone, top tabs on desktop)
2. **No class selected yet** → empty state explains the next step
3. Pick a class from the dropdown
4. **Try the duplicate check**: add an élève (e.g. "Test User" / Masculin / 2010-01-01). Then try to add another one with exactly the same name + genre + date — you should be blocked.
5. **Notice the success toast** after adding — shows the PIN + parent code immediately
6. **Open the vault**: tap "Coffre des codes" header → it expands and shows every élève's codes
7. **Try the copy buttons** — you should get a "PIN copié" toast (works only on HTTPS or localhost; mobile Chrome is fine)
8. **Try Régénérer** on a code — confirms first, then shows the new value in a toast
9. **Tap an élève row** → detail modal opens with editable fields
10. **Try editing the name** to match another existing élève (same genre + date) — duplicate check catches it
11. **Try the danger zone delete** in the detail modal — strong confirm, then cascades the cleanup
12. **Demographics** — should update live as you add/delete élèves (gender + age distribution)
13. **Search** — filter by partial name, instant
14. **Export buttons** — Excel + CSV download immediately on phone (saves to your Downloads folder)
15. **Refresh the page** mid-work — should stay on the same class (URL keeps `?tab=eleves&classe=xxx`)

## Demographics colors

- Boys (♂) — navy
- Girls (♀) — purple (matches the "serie-a" token, just for visual distinction)

## Performance notes

- One subscription opens per selected class (cleaned up when you switch classes or leave the tab)
- The vault panel is closed by default — no rendering cost until opened
- Virtualization kicks in at 50 élèves (mobile only — desktop tables are already fast enough natively)
- Excel/PDF libs are lazy-loaded only when you click an export button

## What's NOT in Phase 3b

- Bulk import (CSV upload) — Phase 3d or later
- Photo upload per élève — defer until needed
- Bulk delete — intentionally avoided (too risky to expose to admins)
- "Voir absences" / "Voir paiements" / "Voir bulletin" links — these come with their respective modules in Phases 4-7

## Coming next

**Phase 3c** — Profs tab:
- Pending approvals at top with one-tap approve/reject
- Active profs list with their assigned classes
- "Assigner classes" modal (replaces the legacy hidden self-assignment flow)
- Prof passkey regeneration widget
- Profs with admin role badge
