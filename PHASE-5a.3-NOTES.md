# RT-SC · Phase 5a.3 — Session leak fix + parent copy polish + dual codes

Three fixes responding to your 5a.1 testing:

## 1. Header showing "Jacques" in parent space

Serious bug — the header `DashboardLayout` was deriving its display name from `profil?.nom ?? eleveSession?.nom ?? '—'`. Two problems:

- `profil` was never cleared when you navigated from `/prof` to `/welcome` to `/auth/parent` without logging out. Still sitting in memory, so it won.
- `parentSession` wasn't even in the fallback chain, so even a clean parent-only session would have shown `'—'`.

**Fix**: derive `displayName` from the ACTIVE `role`, not stacked fallbacks.

```ts
const displayName = (() => {
  if (role === 'admin' || role === 'prof') return profil?.nom ?? '—'
  if (role === 'eleve') return eleveSession?.nom ?? '—'
  if (role === 'parent' && parentSession) {
    const active = parentSession.children[parentSession.activeIndex]
    return active?.nom ?? 'Parent'
  }
  return '—'
})()
```

In the parent space you now see the active child's name (or "Parent" as a safe fallback). No more cross-role session bleed in the header.

Note: `profil` etc. still persist in the store across sessions — which is intentional because it's how we handle role-switching without logging out. But display-layer code should ALWAYS go through `role` to pick the right source. Audit TODO for later: make sure no other component reads profil directly in role-agnostic places.

## 2. "Continuez ainsi !" in parent Accueil

The HeuresColleWidget empty state was élève-voiced ("Continuez ainsi !") even when parent was viewing. Added a `parentMode` prop and parent-framed copy:

- Élève mode: "Aucune colle cette année. Continuez ainsi !"
- Parent mode: "Aucune colle enregistrée pour votre enfant cette année."

`ParentAccueilTab` now passes `parentMode` to the widget. Élève Accueil unchanged.

## 3. Prof → Codes d'accès now shows BOTH codes

The modal previously only showed the parent passkey (`PRNT-XXXX-XXXX`). But élèves have their own PIN (`codePin`, 6 chars) they use to log into the élève space — and you're right that the PP needs to see and distribute both.

Modal renamed from "Codes parents" to **"Codes d'accès"**. Each row now shows two chips:

- **PIN ÉLÈVE** — the 6-char code for élève login
- **CODE PARENT** — the PRNT-... passkey for parent login

Both are copy-to-clipboard. Stacked single-column on mobile, side-by-side on `sm+` screens. Footer text explains which code does what.

Button label on the class card changed from "Codes parents" to "Codes d'accès" to match.

## Files touched

```
MOD  src/components/layout/DashboardLayout.tsx          (role-based displayName)
MOD  src/routes/_shared/colles/HeuresColleWidget.tsx    (parentMode prop)
MOD  src/routes/_shared/ParentAccueilTab.tsx            (pass parentMode)
MOD  src/routes/prof/tabs/classes/MesClassesTab.tsx     (button rename)
MOD  src/routes/prof/tabs/classes/ModalParentCodes.tsx  (dual codes + CodeChip)
```

## On the missing "Élèves" prof tab

You're right that we don't have one. For now, "Codes d'accès" on the PP class card fulfills the need that prompted your mention (distributing codes). A full prof Élèves tab — per-élève detail, absences history, notes overview — belongs in Phase 5d when per-student drill-downs become essential for daily ops (absences, appel, individual tracking). Adding a half-baked one now would be wasted scope.

If you want the roster visible earlier (just a read-only list), that's a small phase we could slot in before 5d.

## Apply on Termux

```bash
cd ~/RT-SC && unzip -o ~/storage/downloads/RT-SC-phase5a.3-sessionleak.zip
```

Vite hot-reloads.

## What to test

1. **Session leak**: log in as prof, don't log out, go to /welcome → "Espace parents" → enter a parent code → parent space shows child's name in the header (not "Jacques").
2. **Parent copy**: parent space Accueil, if the child has no colles, reads "Aucune colle enregistrée pour votre enfant cette année."
3. **Élève copy unchanged**: élève with no colles still reads "Aucune colle cette année. Continuez ainsi !"
4. **Dual codes**: prof → Mes classes → your PP class → "Codes d'accès" button → modal shows both PIN élève and Code parent per élève. Search + copy work.

## Status

```
Phase 5a.3     ✅ Session leak + parent copy + dual codes    ← we are here
Phase 5b       ⏭ Annonces module
```
