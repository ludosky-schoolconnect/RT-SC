# Phase 5c.3 — "Cours du jour" Accueil widget

## What this phase ships

A live status widget on the élève and parent Accueils that answers:
"What's happening at school right now for me/my child?"

Based on the legacy SC widget (app.js line 6130-6290) but rebuilt as a
proper React card with five distinct states, smart formatting, and a
tappable jump to the full Emploi tab.

## The five states

```
1. EN COURS         Pulsing green dot · "En cours · Math"
                    Subtitle: "M. Adjovi · se termine dans 23 min"

2. PROCHAIN         Hourglass (warning amber) · "Prochain cours · Histoire"
                    Subtitle (≤2h): "Mme Diallo · dans 1h12"
                    Subtitle (>2h): "Mme Diallo · à 14:00"

3. TERMINÉ          Sparkles (navy) · "Plus de cours aujourd'hui"
                    Subtitle: "Bonne fin de journée — repos bien mérité."

4. JOURNÉE LIBRE    Sparkles (gray) · "Journée libre"
                    Subtitle: "Pas de cours ce dimanche."

5. PAS D'EMPLOI     Calendar (gray) · "Emploi du temps"
                    Subtitle: "Pas encore publié par la direction."
```

State derivation lives in a single pure `computeState()` function — all
the time logic flows through it. Easy to test, easy to reason about.

## Why it's better than the legacy

Legacy was a single line of HTML text injected by a MutationObserver
(line 6130). It worked but felt afterthought:
- Only on élève screens — parents got nothing
- No prof name (you could see "Math" but not who teaches it)
- Plain text, not tappable
- "1h12" was missing (just showed "à 09h00")

RT-SC version:
- Card UI matching the rest of the design system
- Five states with appropriate iconography and color tones
- Prof name always shown
- Smart countdown that switches to absolute time after 2 hours (less
  visual noise: "à 14:00" reads cleaner than "dans 4h25")
- Tap → opens the full Emploi tab so you can see the rest of the day
- Lives on BOTH élève and parent Accueils

## Live update behavior

The widget re-derives state on every render of the Accueil. It does NOT
spin up a 1-second ticker — that would force re-renders just to update
"23 min" → "22 min", which isn't worth the cost.

In practice every interaction (tab switch, navigating in/out of accueil,
opening a modal) refreshes the widget. The pulsing green dot is purely
CSS animation; no JS interval needed.

If we ever want minute-level live ticking, we'd add a `useEffect` with
a 60s interval scoped to the EN COURS state only. For now the implicit
refresh on interaction is enough.

## Files

### New

- `src/routes/_shared/emploi/CoursDuJourWidget.tsx`  
  ~250 lines. Pure helpers (`computeState`, `formatRemaining`) at the
  top, then the React component. Takes `classeId` + optional
  `onOpenEmploi` callback. When clickable, the whole card is a button
  with a chevron at the right.

### Modified

- `src/routes/_shared/AccueilTab.tsx` (élève)  
  Added widget at the top of the "Mon suivi" section, before
  `HeuresColleWidget`. Added `onNavigateToEmploi` prop.

- `src/routes/_shared/ParentAccueilTab.tsx` (parent)  
  Added widget at the top of "Suivi scolaire" section, before
  `HeuresColleWidget`. **Removed** the now-redundant Emploi
  `PreviewWidget` from "Vie de l'école" (the live widget replaces the
  placeholder). Added `onNavigateToEmploi` prop.

- `src/routes/eleve/EleveDashboard.tsx`  
  Passes `onNavigateToEmploi={() => navigateToTab('emploi')}` to
  `AccueilTab`.

- `src/routes/parent/ParentApp.tsx`  
  Passes `onNavigateToEmploi={() => navigateToTab('emploi')}` to
  `ParentAccueilTab`.

## Why no prof Accueil widget yet

Profs don't currently have an Accueil tab — they land directly on "Mes
classes". When we eventually build a Prof Accueil (covered loosely by
"Phase 5e — PP Vie scolaire" or its own polish phase), the
CoursDuJourWidget can be reused there with minimal changes — we'd just
swap `classeId` for `profId` and have the widget filter accordingly.

The widget itself is currently classeId-scoped because that's the
client need. If/when we add prof support we'd extract a tiny seance
filter prop and let the consumer pass either filter type.

## Testing priorities

1. **EN COURS state** — set device clock to a weekday during a séance
   window, verify pulsing green dot, matière, prof name, "se termine
   dans X min" countdown.

2. **PROCHAIN within 2h** — set clock 1h before next séance, verify
   "dans 1h" countdown.

3. **PROCHAIN beyond 2h** — set clock 3h before next séance, verify "à
   HH:MM" absolute display.

4. **TERMINÉ** — set clock after the day's last séance, verify "Plus de
   cours aujourd'hui."

5. **JOURNÉE LIBRE** — open on Sunday, verify "Pas de cours ce
   dimanche."

6. **PAS D'EMPLOI** — log in as an élève whose class has zero séances,
   verify "Pas encore publié."

7. **Tap → emploi** — tap the widget on both élève and parent screens,
   should land on the Emploi tab.

8. **Multi-child parent** — switch between children with different
   schedules, verify the widget swaps correctly.

## What's NOT in this phase

- Prof Accueil widget — needs a Prof Accueil tab first.
- Real-time minute-level ticking — currently relies on natural
  re-renders; can add later if users complain about staleness.
- Push notifications ("ton cours commence dans 5 min") — far future.
