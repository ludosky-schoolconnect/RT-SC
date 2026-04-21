# Phase 6d.2 — Staff login redesign · COMPLETE

Combines Turn 1 (infrastructure + chooser) and Turn 2 (CaisseAuth +
forgot password + pending role distinction) into a single shipped
phase. Zip contains ALL files needed.

## What's live

### New umbrella: "Personnel de l'école"

Welcome page staff tile now says "Personnel de l'école" with the
description "Professeurs et caissiers : accéder à mon espace."
Tapping it lands on the chooser at `/auth/personnel`.

### Chooser screen

Two cards:
- **Professeur** (GraduationCap icon) → `/auth/personnel/prof`
- **Caissier** (Wallet icon) → `/auth/personnel/caisse`

### Caissier auth flow

`/auth/personnel/caisse` has tabs: Connexion | Inscription.

**Signup** fields: Nom, Email, Mot de passe, Code d'accès caisse.
**No matières section** (caissier doesn't teach). The caisse passkey
is verified against `securite.passkeyCaisse` with a fallback to
`securite.passkeyProf` for legacy schools that haven't generated a
distinct caisse code yet.

On successful signup, the Professeur doc is created with:
```
{
  nom, email,
  matieres: [],
  classesIds: [],
  role: 'caissier',          // <— stamped at creation
  statut: 'en_attente',
  createdAt: serverTimestamp()
}
```

Admin approval is the same flow as before (`useApproveProf` just
flips `statut` to `'actif'`). No manual role change after approval —
the role was stamped at signup.

**Login** redirects based on profil.role:
- caissier actif → `/caissier`
- caissier en_attente → `/prof/en-attente` (shared screen, role-aware copy)
- prof → sign out + toast "vous avez un compte professeur"
- admin → sign out + toast "espace réservé aux caissiers"

### En-attente screen is now role-aware

`EnAttentePage` was hardcoded for prof. Now:
- Auto-redirects to `/prof` OR `/caissier` based on role
- Greeting says "Votre compte **caisse** a bien été créé" for
  caissiers (vs "Votre compte **professeur**" for profs)
- Same layout, just role-swapped copy

### Dual passkey admin panel

Already shipped in Turn 1. `PasskeyProfPanel` renders two cards
side-by-side: Code professeur + Code caisse. Each has its own
regenerate button with a role-specific confirmation dialog.

### Pending approval list — role badge

`PendingProfsList` now shows a role pill on each pending entry:
- Professeur (GraduationCap icon, neutral badge)
- Caissier (Wallet icon, navy badge)

Avatar is tinted by role too (navy/gold for caissier, info-bg/navy
for prof) so admin can scan the list at a glance.

Approval dialog is role-aware:
- Prof: "Le professeur aura immédiatement accès à son tableau de
  bord et pourra voir ses classes assignées."
- Caissier: "Le caissier aura immédiatement accès au terminal de
  caisse, au bilan et au guichet d'admission."

Matières pills are hidden for caissier entries (they have empty
matieres arrays).

### Forgot password honesty

The `ForgotPasswordModal` used to say "Email envoyé à {email}.
Vérifiez votre boîte de réception." which was misleading — Firebase
doesn't send anything if the email isn't linked to an existing
account, but also doesn't report the failure (email enumeration
protection).

Updated copy:
- Label: "Email d'inscription" (was "Email du compte")
- Hint: "Tapez l'adresse email exacte avec laquelle vous avez
  créé votre compte."
- Footer: "Important : le lien sera envoyé uniquement si l'email
  correspond à un compte existant. Si vous ne recevez rien dans la
  minute, vérifiez votre dossier Spam, puis assurez-vous d'avoir
  saisi la même adresse que lors de votre inscription."
- Success toast: "Si {email} est lié à un compte, un email vous a
  été envoyé. Vérifiez aussi vos spams."

### ProtectedRoute — en-attente gate covers caissier

The en-attente redirect used to fire only for `role === 'prof'`.
Now it covers both prof and caissier since both go through admin
approval. Same `/prof/en-attente` page handles both roles with
role-aware copy.

### Backward compat

- `/auth/prof` — still works but renders the chooser instead of
  the direct form (educates users on the caissier entry point
  without breaking bookmarks)
- Existing `useUpdateProfRole` mutation in ModalProfDetail remains
  as a fallback for edge cases (e.g. admin wants to move someone
  between roles after the fact)

## Files changed

### New files
- `src/routes/auth/PersonnelChoice.tsx` — chooser screen (Turn 1)
- `src/routes/auth/CaisseAuth.tsx` — caissier auth tabs

### Modified
**Turn 1 files (re-included for completeness):**
- `src/lib/benin.ts` — `genererPasskeyCaisse`
- `src/types/models.ts` — `SecuriteConfig.passkeyCaisse?: string`
- `src/hooks/useProfsMutations.ts` — new `useRegeneratePasskeyCaisse`;
  `useRegeneratePasskeyProf` invalidates query
- `src/routes/admin/tabs/profs/PasskeyProfPanel.tsx` — dual-card panel
- `src/routes/welcome/WelcomePage.tsx` — staff tile relabeled
- `src/routes/admin/tabs/finances/FinancesAdminTab.tsx` — Section import restored

**Turn 2 files (new in this ship):**
- `src/App.tsx` — `/auth/personnel/caisse` route wired
- `src/components/guards/ProtectedRoute.tsx` — en-attente covers caissier
- `src/components/ui/ForgotPasswordModal.tsx` — honest copy
- `src/routes/prof/EnAttentePage.tsx` — role-aware redirect + greeting
- `src/routes/admin/tabs/profs/PendingProfsList.tsx` — role pill + avatar tint

## Rules — no changes needed

The existing rule on `/professeurs/{userId}`:
```
allow create: if request.auth != null
              && request.auth.uid == userId
              && request.resource.data.statut == 'en_attente';
```

permits both `role: 'prof'` and `role: 'caissier'` since the rule
doesn't constrain the role field at creation time. The Phase 6d
rules handle everything else (caissier can't write to
admin-owned collections once approved).

## Testing

### Happy path — caissier signup

1. Admin logs in → Profs tab → generate the caisse passkey
   (if not already set); copy it
2. Log out → Welcome → "Personnel de l'école" → chooser → Caissier
3. Inscription tab → fill form: Nom, Email, 8+ char password,
   paste the caisse passkey
4. Submit → should see "Compte caisse créé. En attente
   d'approbation…"
5. Stay on the en-attente screen — it says "Votre compte **caisse**
   a bien été créé"

### Admin approves the caissier

6. On another device, admin logs in → Profs tab → scroll to
   "En attente d'approbation"
7. The new caissier row has a **navy avatar** + **navy "Caissier"
   badge** with a Wallet icon
8. Tap Approve → dialog reads "Le caissier aura immédiatement accès
   au terminal de caisse, au bilan et au guichet d'admission."
9. Confirm → caissier row disappears from pending list

### Caissier's en-attente screen auto-transitions

10. Back on the caissier's device (still sitting on en-attente
    screen), **without a refresh**, the page should navigate to
    `/caissier` within ~1 second of admin approval
11. Caissier is now in the terminal de caisse dashboard

### Forgot password

12. Log out → Welcome → Personnel → Caissier → Login tab → click
    "Mot de passe oublié ?"
13. Type the caissier's signup email → submit
14. Toast reads "Si {email} est lié à un compte, un email vous a été
    envoyé."
15. Open the caissier's inbox → receive the Firebase reset link
16. Set a new password → log back in with it

### Wrong-role bounces

17. Try logging in as a PROF account at `/auth/personnel/caisse`
18. Should get signed out + toast "Vous avez un compte professeur.
    Utilisez l'espace professeur."

19. Try logging in as an ADMIN account at `/auth/personnel/caisse`
20. Should get signed out + toast "Cet espace est réservé aux
    caissiers."

### Fallback passkey (legacy schools)

21. In Firestore, manually DELETE the `passkeyCaisse` field from
    `/ecole/securite` (leaving only `passkeyProf`)
22. Try caissier signup again, using the **passkeyProf value**
23. Signup should succeed (fallback kicks in)
24. Admin panel shows "Non défini — le code professeur fera office
    par défaut." on the caisse card

## What's NOT in this phase

- Multi-role (still exclusive: one user = one role)
- Separate caissier en-attente page (shared with prof, role-aware copy)
- Caissier self-service password change from inside /caissier
  (use forgot-password flow or ask admin)
- Email verification (Firebase can send verification emails; not
  wired because your schools don't require it)

## Roadmap

- ✅ Phase 6d.2 COMPLETE
- **NEXT: Phase 6e — Sub-modes nav redesign**
  - Kill Plus menu on admin
  - Admin gets 5 flat tabs: Classes · Élèves · Profs · Vie · Pédagogie
  - "Pédagogie" folds Inscriptions + Emploi + Annonces + Année
- Phase 6f — SaaS kill switch + FedaPay
- Phase 6g — Vendor command center
