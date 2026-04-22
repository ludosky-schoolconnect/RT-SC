# RT-SC · Claude briefing (read this first)

Hi — you're Claude, picking up a fresh session. This doc gets you
fully up to speed on **RT-SC** (the React/TypeScript multi-tenant
SaaS school management app for Bénin, formerly vanilla SchoolConnect).

Read this, then skim the other handover docs for deeper context, then
ask Ludosky what the task is.

---

## 1 · Who I'm working with

**Ludosky** — solo full-stack developer based in Bénin, West Africa.
Builds on **Termux on Android** (no desktop dev environment). Deploys
Firebase projects via Firebase CLI and Cloudflare tunnels. Maintains
the app single-handed.

**How Ludosky works best**:
- Large, comprehensive deliverables over incremental trickles
- Production-quality, not prototypes
- Direct honest feedback over hedging
- Pushes back firmly if output feels basic — respect that and level up
- French for user-facing copy, English for code
- Works tab-by-tab / feature-by-feature, ships often

**Patch delivery mechanism**: Ludosky unzips patch zips I send into
`~/RT-SC`, runs `npm run build`, commits, and deploys via
`./deploy-school.sh schools/<id>.json [--hosting-only|--rules-only]`.

**My job** in each session:
1. Read & modify files inside `/home/claude/RT-SC/`
2. Run `npx tsc --noEmit` to verify no TypeScript errors
3. Package changed files into a zip at `/mnt/user-data/outputs/`
4. Present the zip with `present_files`
5. Give exact bash commands to apply + deploy

---

## 2 · Project architecture snapshot

**Stack**: React + TypeScript + Vite + Tailwind + Zustand (UI state) +
TanStack Query (server state) + Firebase (Auth, Firestore, Hosting).
Radix/Headless primitives for a11y. Framer Motion for animation.

**Multi-tenant model**: one Firebase project per school.
- **Hub project**: `schoolconnect-1adfa` — marketing site, school directory, SaaS admin
- **Per-school projects**: `schoolconnect-nlg`, `schoolconnect-mag`,
  `schoolconnect-houeto` (CEG HOUETO), etc.
  Each school has its own Firestore, Auth, and subdomain.

**Deploy flow**: `./deploy-school.sh schools/<id>.json`
- `--hosting-only` → ships only built assets (fast, code-only changes)
- `--rules-only` → ships only Firestore security rules
- (no flag) → ships both (use when code + rules changed together)

**SaaS master email**: `ludoskyazon@gmail.com` — `isSaaSMaster()` helper
in Firestore rules gives this user bypass access to everything.

**Code structure** (key folders in `src/`):
```
src/
  App.tsx                       # Top-level routing
  main.tsx                      # Entry point
  firebase.ts                   # Firebase init
  styles/
    tokens.css                  # Design tokens (CSS variables)
    base.css                    # Global base styles
  components/
    ui/                         # Primitives: Button, Card, Input, Modal,
                                #   ToggleSwitch, IconButton, Badge, ...
    layout/
      Section.tsx               # Standardized section shell w/ SectionHeader
      DashboardLayout.tsx       # Adaptive (mobile bottom nav / desktop top tabs)
    settings/
      SettingsModal.tsx         # Font-size modal
  stores/                       # Zustand stores (auth, toast, confirm, settings)
  hooks/                        # TanStack Query hooks (one per resource)
  lib/                          # Pure helpers (bulletin math, benin utils, ...)
  types/models.ts               # Single source-of-truth for Firestore types
  routes/
    welcome/                    # Public welcome / landing
    inscription/                # Public pre-inscription form
    auth/                       # Login screens per role
    admin/
      AdminDashboard.tsx        # Tab router
      tabs/{classes,eleves,...} # One folder per feature
    prof/
      ProfDashboard.tsx
      tabs/{notes,classes,...}
    eleve/
      EleveDashboard.tsx
    parent/
      ParentApp.tsx             # Multi-child switcher above tabs
    caissier/
      CaissierDashboard.tsx
    _shared/                    # Widgets + tabs shared across roles
      AccueilTab.tsx              # Élève home
      ParentAccueilTab.tsx        # Parent home (parent-framed voice)
      bulletins/
      colles/
      absences/
      annonces/
      emploi/
      annales/
      civisme/
      annuaire/
      visio/
      English hub widget
      BilanAnnuelWidget
```

**Design system identity**: Navy + gold + white ("Ivy League premium").
`Playfair Display` for display, `DM Sans` for body. Tokens defined as
RGB-triplet CSS variables in `src/styles/tokens.css` and consumed by
Tailwind as `rgb(var(--color-navy) / <alpha-value>)`. This lets
utilities like `bg-navy/40` work.

---

## 3 · Firestore schema (mental model)

```
/ecole/
  config                      → school identity (nom, ville, devise, adresse,
                                 telephone, anneeActive, ...)
  bulletinConfig              → {typePeriode, nbPeriodes, modèle, ...}
  matieres                    → list of matières configurable by admin
  coefficients_<targetId>     → coefficients per niveau/série
  finances                    → frais de scolarité settings
  securite                    → security settings
  subscription                → subscription state (abonnement tab)
  examens                     → {examens: ExamCountdown[]}

/settings_inscription/config  → pre-inscription docs + preinscriptionsOuvertes toggle

/classes/{classeId}
  /eleves/{eleveId}           → student roster
  /notes/{noteId}
  /colles/{colleId}
  /bulletins/{bulletinId}
  /paiements/{paiementId}
  /civismeHistory/{entryId}

/pre_inscriptions/{id}        → public form submissions
  /documents/{docId}          → compressed-base64 attachments

/annees_scolaires/{anneeId}   → per-year archive (rollover)

/professeurs/{uid}            → staff (role ∈ 'admin'|'prof'|'caissier')

/rv_counters/{DD-MM-YYYY}     → RV slot counters (one per date)

/annonces/{id}                → school/class announcements

/system/{document=**}         → app-wide state (masked from non-admin)
```

**Rules** in `firestore.rules` are gated by three helpers:
- `isStaff()` — any authenticated non-anonymous user
- `isAdmin()` — staff user where `/professeurs/{uid}.role == 'admin'`
- `isSaaSMaster()` — user whose token email is `ludoskyazon@gmail.com`

Recent rule additions:
- `preinscriptionsOpen()` — reads `/settings_inscription/config.preinscriptionsOuvertes`, defaults OPEN if unset. Gates CREATE on `/pre_inscriptions/*` and its `/documents/*` subcollection. F12-proof — attackers can't bypass by manipulating the console.

---

## 4 · What shipped in the last sessions

### Welcome page editorial redesign (live on all schools)
- Full-bleed hero photo (Beninese students in uniform, AI-generated, at `/public/welcome-hero.webp` + `.jpg`)
- SchoolConnect logo top-left, date top-right
- Dynamic crest (first letter of school name)
- School name in huge Playfair, city + devise with gold hairlines
- Time-aware "Bonjour." greeting + "Qui êtes-vous ?"
- **Editorial role list** with Roman numerals:
  - I. ADMINISTRATION
  - II. PERSONNEL
  - III. ÉLÈVES
  - IV. PARENTS
- Each role: uppercase tracked title, short non-italic description, "ACCÉDER À MON ESPACE →" CTA, hanging-indent layout
- Stats sentence: *"Aujourd'hui, X élèves répartis dans Y classes."* (italic serif)
- **Pré-inscription link intentionally removed** from footer (admins have QR-code flow; public button invites spam)

### Pre-inscription open/close gate (live)
- Admin toggle in Année tab → Inscriptions section
- Public `/inscription` page shows a "Closed" notice when off, form when on
- **Firestore rules enforce server-side** — F12-proof
- Lives in `/settings_inscription/config.preinscriptionsOuvertes` (bool, defaults OPEN)
- Hook: `useTogglePreinscriptions()` (dedicated mutation for instant UX)

### Shared `<ToggleSwitch>` component (live)
- At `src/components/ui/ToggleSwitch.tsx`
- One source of truth for on/off switches across the app
- Props: `checked`, `onChange`, `ariaLabel`, `title`, `disabled`, `onColor` (default `'success'`, also `'navy'` | `'gold'`)
- Already in use in: PreinscriptionToggleCard, RecompenseFormModal, RecompensesSection
- Pattern: h-6 w-11 track, h-5 w-5 thumb, translate-x for thumb motion (NOT absolute left/top — that was the original bug)

### Exam countdown feature (live)
- Admin CRUD: new "Examens" tab with Hourglass icon (`ExamensAdminTab.tsx`)
- Data: `/ecole/examens.examens[]` — array of `{id, label, date (YYYY-MM-DD), cible ∈ 'tous'|'3eme'|'terminale'}`
- Helpers in `src/lib/exam-utils.ts`: `isExamClass`, `getExamLevel`, `countdownAppliesTo`, `daysUntil`, `upcomingRelevantCountdowns`, `upcomingRelevantCountdownsForProf`, `urgencyTier`, `daysRemainingLabel`, `cibleLabel`
- Hooks: `useExamens()` + `useUpdateExamens()`
- Widget: `src/components/ExamCountdownWidget.tsx` — reusable, two modes (`'eleve'` with `eleveLevel` prop / `'prof'` with `classLevels` prop)
- Visibility rules (port of vanilla semantics):
  - Only 3ème and Terminale ever see countdowns (hardcoded exam levels)
  - `cible='tous'` means 3ème + Terminale combined, NOT everyone
  - Profs see widget if they teach AT LEAST one 3ème or Terminale class
  - **Parents see widget if their active child is in 3ème or Terminale** (mounted on `ParentAccueilTab`)
  - Past countdowns auto-hide from student/prof/parent dashboards (still visible in admin for audit)
- Urgency tiers: red ≤7 days, amber ≤30, green beyond
- Gold "Prochain" badge on the nearest upcoming countdown in admin view

### Préférences modal — font-size only (live)
- Location: `src/components/settings/SettingsModal.tsx`
- Store: `src/stores/settings.ts`
- One live feature: font size (small/normal/large) persisted to localStorage, applied via CSS custom property `--app-font-size` on `<html>`
- **Theme switcher was built and reverted** — kept in mind for later but the visible palette migration needs more thought
- **Language (i18n) deferred indefinitely** — French-only codebase; users can use browser auto-translate for English

### CSS variable migration (Step B — invisible, live)
- `tokens.css` — all colors defined as RGB triplets `--color-navy: 11 37 69`
- `tailwind.config.js` — every color consumes `rgb(var(--color-X) / <alpha-value>)`
- Legacy hex aliases (`--navy`, `--ink-100`, ...) preserved in `:root` for code that references them directly
- `theme()` calls in `base.css` replaced with direct `rgb(var(--color-X))`
- **Light mode renders byte-identical to before** — Step B was pure plumbing for future theme work

---

## 5 · What's NOT done / future work

**Blaze foundation (dormant in `/functions/`)** — Sessions A and B of the Blaze
rollout shipped: `functions/` directory with scaffolding and 5 functions
total. The code sits compiled but unshipped; nothing executes until Ludosky
enables Blaze + runs the deploy playbook at `/DEPLOY-ONCE-BLAZE-IS-READY.md`.

Shipped functions (dormant):
  - **Session A · Security**
    - `onProfDelete` — deletes Auth user when `/professeurs/{uid}` is deleted
    - `fedapayWebhook` — HTTP endpoint that receives FedaPay events and
      writes new deadline server-side (closes F12 bypass)
  - **Session B · Email pipeline (Resend-backed)**
    - `subscriptionReminder` — scheduled daily at 00:00 Africa/Porto-Novo,
      emails admin at 14/7/3 days before deadline + during 3-day grace period
    - `onPreInscriptionStatusChange` — emails applicant when admin approves
      or refuses (if they provided `emailParent` on the form)
    - `testEmail` — optional HTTP smoke-test endpoint (delete after
      verifying delivery works)

Frontend changes shipped alongside Session B:
  - `InscriptionFormPanel.tsx` — added optional "Email du parent" field
  - `types/models.ts` — added `emailParent?` to `PreInscription` interface

Sessions C/D pending:
  - Session C: scheduled jobs (daily presence rollover, monthly civisme
    purge, nightly Firestore backup with 30-day rotation + snapshot-on-rollover)
  - Session D: frontend cleanup (remove `useArchiveRollover` lazy hook,
    `useSchoolAbsences` batch delete, manual Purger button)

**Also deferred — unrelated to Blaze**:

**Theme switching (dark / sepia)** — deferred. The CSS variable infrastructure is in place (Step B). The user-facing switcher and the dark/sepia palettes have been removed from the codebase. Revisiting this later requires:
- Audit how `navy` token is used (brand button bg vs. primary text — overloaded)
- Introduce `text-primary` separate from `bg-brand-navy`
- Audit `bg-white` usages → migrate cards to a theme-aware `surface` token
- Audit `text-white` usages → if on colored buttons, migrate to literal-white utility
- Migrate ~38 raw hex + ~55 rgba in TSX files to tokens
- Define dark + sepia palettes that pass WCAG AA contrast
- Ship switcher UI + default = light

**i18n / English translation** — deferred. Béninois schools are French-speaking.

**Bulletin `anneeScolaireId` migration** — historical bulletins aren't tied to a specific school year. Will break after 2-3 school years without this.

**Bulletin model 2 format** — the official Béninois bulletin format (different from current).

**Server-side Auth user deletion** on prof delete — currently only the Firestore doc is deleted, Auth account persists. Needs Cloud Functions.

**Subscription expiry enforcement** — admin can renew but no auto-lock on expiry.

**Annuaire phone verification** — parents should verify their number before appearing in the directory.

**Admin-uploadable school logo** — currently a letter crest; Phase 2 feature.

**Service worker / offline** — caching for bulletins + announcements.

**English Hub anti-cheat** — Hub feature to flag suspicious patterns.

**Analytics dashboard** — login success rate, PDF generation events, etc.

---

## 6 · Conventions Ludosky expects me to follow

**Copy voice**:
- User-facing, not developer-facing
- Don't name technologies ("Firestore", "server rules", "F12") — state outcomes
- Short, confident, warm
- Example of what Ludosky rejected: *"Protection serveur active : les règles Firestore refusent toute création, même via manipulation de la console."* → rewrote as *"Aucune soumission ne sera acceptée tant que les pré-inscriptions resteront fermées."*

**Code quality**:
- Comments at the top of each file explaining the what and why, not just the what
- Hooks colocated with resources in `src/hooks/useXxx.ts`
- One TanStack Query key per resource (e.g. `['examens']`)
- Mutations invalidate their query key on success
- Zod for runtime validation only where genuinely needed (not everywhere)

**Styling**:
- Tailwind tokens always (avoid raw hex)
- Mobile-first, ≥44×44px touch targets
- Animations subtle; use Framer Motion for entrance/exit, CSS for hover
- Playfair for headings, DM Sans for body

**UI primitives already in the codebase — reuse them**:
- `<Card accent>` for elevated containers (gold left border)
- `<Section>` + `<SectionHeader kicker="..." title="..." description="..." />` for tab pages
- `<Button variant="primary|secondary|danger" leadingIcon={} loading={}>`
- `<IconButton variant="danger|ghost">`
- `<Input>`, `<Select>`, `<Textarea>`, `<Checkbox>` (controlled)
- `<Modal open={} onClose={}><ModalHeader><ModalTitle></ModalTitle></ModalHeader><ModalBody></ModalBody><ModalFooter></ModalFooter></Modal>`
- `<EmptyState icon={} title="" description="" />`
- `<Spinner size="sm|md|lg" />`
- `<Skeleton />`
- `<ToggleSwitch>` (the shared one)
- Toast: `const toast = useToast(); toast.success('...') / toast.error('...')`
- Confirm: `const confirm = useConfirm(); const ok = await confirm({ title, message, confirmLabel?, cancelLabel?, variant: 'danger'|'warning'|'info' })` — **IMPORTANT**: field name is `message`, NOT `description`

**Tailwind color tokens**:
- Brand: `navy` (+ `-light`, `-dark`), `gold` (+ `-light`, `-pale`, `-dark`)
- Neutral: `ink-50` through `ink-800`, `white`, `off-white`
- Semantic: `success` (+ `-bg`, `-dark`), `warning` (+ ...), `danger` (+ ...), `info` (+ `-bg`)
- Séries: `serie-a` / `serie-b` / `serie-c` / `serie-d` (+ `-bg`)

**Firestore key helpers** (in `src/lib/firestore-keys.ts`):
- `ecoleConfigDoc()`, `ecoleBulletinConfigDoc()`, `ecoleMatieresDoc()`, `ecoleCoefficientsDoc(targetId)`, `ecoleFinancesDoc()`, `ecoleSecuriteDoc()`, `ecoleSubscriptionDoc()`, `ecoleExamensDoc()`, `settingsInscriptionDoc()`

---

## 7 · Workflow

**Every session**:
1. Read the handover docs in `/home/claude/RT-SC/handover/` (if present)
2. Ask Ludosky what the task is (don't guess from memory)
3. Scan relevant existing code before writing new code
4. Implement with care, using existing primitives
5. TS-check: `cd /home/claude/RT-SC && npx tsc --noEmit`
6. Package changed files into `/mnt/user-data/outputs/RT-SC-<descriptive-name>.zip`
7. Present the zip with `present_files`
8. Provide deploy commands (pilot on NLG first, verify, then batch)

**Things to ALWAYS grep-verify before assuming**:
- Existing component API shapes (e.g. `ConfirmOptions` uses `message`, not `description`)
- Existing token names in Tailwind config
- Existing Firestore key helpers
- Existing hook names (don't invent `useXyz` if one exists)

**Patch zip naming**: `RT-SC-<feature-or-area>.zip` — short, kebab-case, descriptive

**When I should push back**:
- If a design feels too cluttered → suggest restraint
- If copy feels too technical → propose user-facing version
- If a feature creates obvious support burden → flag it (e.g. public pre-inscription button = spam magnet)
- If Ludosky asks for something that would break existing flows → explain the trade-off

---

## 8 · First actions this session

1. Acknowledge the context: *"Read the briefing. RT-SC React/TS multi-tenant school SaaS, Termux on Android, deploy via deploy-school.sh. Ready."*
2. Ask Ludosky what the task is
3. If it involves existing code, grep to understand current state before proposing changes
4. Follow the zip-ship-deploy loop

Don't assume anything that isn't in this doc. When in doubt, ask.

---

**End of briefing.**
