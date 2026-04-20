# RT-SC · Phase 5a.4 — Time-aware greeting + structure answer

Two responses to your feedback.

## 1. Time-aware greeting

The greeting was hardcoded to "Bonjour" regardless of time. Fixed with a small helper:

```
05:00 – 11:59  →  "Bonjour"
12:00 – 17:59  →  "Bon après-midi"
18:00 – 04:59  →  "Bonsoir"
```

Applied to both AccueilTab (élève) and ParentAccueilTab (parent). The 05:00 lower bound prevents late-night insomniacs from getting "Bonjour" when culturally it's still "Bonsoir".

Evaluated fresh on every render, which is fine for this use case — the greeting persists through the session even if time crosses a boundary (nobody notices, no bug).

## 2. Should "Vie de l'école" and "Communauté" be tabs instead of Accueil cards?

Yes — eventually. But the answer for now is "keep them as preview tiles on Accueil, promote to tabs as modules ship."

### The right long-term model

Accueil = at-a-glance dashboard with summary tiles that LINK into dedicated tabs. Each module gets a proper tab:

- Accueil (tiles: latest annonce, next absence, unpaid balance, etc.)
- Bulletins (exists)
- Annonces (inbox — Phase 5b)
- Absences (calendar + history — Phase 5d)
- Emploi (weekly grid — Phase 5c)
- Paiement (statement — Phase 6)
- Annuaire des parents (searchable — later)
- Plus (settings, logout)

Too many for bottom nav (4 max). Possible split:
- **Bottom nav**: Accueil · Bulletins · École (sub-tabs) · Plus
- OR: promote modules individually as they become essential, demote others to Plus

I'll decide the exact split when we're ~2 modules in and can see what feels crowded. Forcing the structure now would be premature.

### Why not restructure now?

Because the modules don't exist yet. If I add "Annonces" as a tab today, it's an empty container saying "Bientôt". That's worse UX than the current tile which at least sits in a visual summary of what's coming.

The tiles on Accueil are correctly marked "BIENTÔT" — they set expectations without pretending to be content. When each module ships in 5b/c/d/6, the tile becomes LIVE (showing count + latest item, tap → dedicated view). At that point we assess whether the tile is enough or a full tab is warranted.

Translation: no structural change in this patch. Only greeting fix. Structural reorganization comes alongside the first real module (Phase 5b Annonces) so it has actual content to justify its tab.

## Files touched

```
NEW  src/lib/greeting.ts                              (time-aware helper)
MOD  src/routes/_shared/AccueilTab.tsx                (use helper)
MOD  src/routes/_shared/ParentAccueilTab.tsx          (use helper)
```

## Apply on Termux

```bash
cd ~/RT-SC && unzip -o ~/storage/downloads/RT-SC-phase5a.4-greeting.zip
```

Vite hot-reloads.

## What to test

1. Open the app between 05:00 and 11:59 → "Bonjour"
2. Open between 12:00 and 17:59 → "Bon après-midi"
3. Open between 18:00 and 04:59 → "Bonsoir"
4. Both élève and parent sides show the contextual greeting
5. Right now (mid-afternoon your timezone, likely after 15:00) → "Bon après-midi"

## Status

```
Phase 5a.4     ✅ Time-aware greeting                     ← we are here
Phase 5b       ⏭ Annonces module (structure reassessed there)
```
