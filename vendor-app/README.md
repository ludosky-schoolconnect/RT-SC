# SchoolConnect Vendor Command Center

A standalone React/Vite app for Ludosky to manage every school's
SchoolConnect subscription. Lives in `vendor-app/` and deploys
independently from RT-SC (the school-facing app).

Built with the same stack + design language as RT-SC (Vite, React,
TypeScript, Tailwind, Firebase 10.x modular SDK) so the two apps feel
like part of the same product family.

## What it does

Flow: **pick an école → log in → manage**.

1. **School selector** — list of schools you've used before (stored in
   browser localStorage). Tap one to connect. Or add a new school by
   pasting its Firebase config.
2. **Login** — enter your vendor email + password (registered in
   that school's Firebase Auth as an admin user).
3. **Command Center** — manage:
   - **FedaPay** public key for that school
   - **Abonnement**: price in FCFA + duration in months
   - **Support**: your WhatsApp number
   - **Actions**: record a payment (applies fairness logic), reset
     cycle, clear unlock-request alerts
   - **Verrouillage manuel**: toggle immediate lock/unlock
4. **Switch / logout** — tear down the Firebase connection and pick
   another school, or log out but stay on the same school.

### Security model

- **Public Firebase configs are stored locally** in browser localStorage.
  These config objects are meant to be embedded in public-facing apps
  — nothing sensitive.
- **Credentials (email, password) are NEVER stored.** You enter them on
  every login.
- **One active Firebase connection at a time.** Strategy A from the
  scoping: switching schools fully tears down the previous Firebase
  app instance before initializing the next one. No cross-school data
  leaks possible.
- **Deploy at an obscure URL** (see below) + Firebase Auth gate = two
  layers of protection.

## Develop locally

```bash
cd vendor-app
npm install
npm run dev
```

Opens on `http://localhost:5174`. This connects to real Firebase
projects — be careful with actions in development (use sandbox
Firebase projects or test on schools you're setting up fresh).

## Build

```bash
npm run build
```

Produces `vendor-app/dist/` — static files ready for any host.

## Deploy

Three options. Pick based on how visible you want this to be.

### Option A — Firebase Hosting, obscure path (RECOMMENDED)

Host alongside your main web presence but at a URL nobody will
stumble onto. Example: `https://schoolconnect-beninland.app/__vendor/`.

1. Decide which Firebase project hosts this. Simplest: a dedicated
   Firebase project for vendor tools. Or piggy-back on an existing
   hosting site using a rewrite.
2. Create `vendor-app/firebase.json`:

   ```json
   {
     "hosting": {
       "public": "dist",
       "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
       "rewrites": [{ "source": "**", "destination": "/index.html" }],
       "headers": [
         {
           "source": "**",
           "headers": [
             { "key": "X-Robots-Tag", "value": "noindex, nofollow" }
           ]
         }
       ]
     }
   }
   ```

3. Create `vendor-app/.firebaserc` pointing to your hosting project:

   ```json
   { "projects": { "default": "your-vendor-hosting-project-id" } }
   ```

4. Build + deploy:

   ```bash
   cd vendor-app
   npm run build
   firebase deploy --only hosting
   ```

5. Access it at `https://your-vendor-host.web.app/` (or your custom
   domain + path).

### Option B — Separate host (Netlify / Vercel / GitHub Pages)

Push `vendor-app/` as its own repo. Any static host works since it's
pure static files after `npm run build`. Nothing special needed.

### Option C — Local-only

Never deploy. Run via `npm run dev` (or `npm run build && npm run preview`)
whenever you need to manage a school. Maximum security but requires
you to always have your dev environment handy.

## Onboarding a new school

1. In that school's Firebase console → Project Settings → Your apps →
   copy the web config block.
2. Open vendor-app → tap "Ajouter une école".
3. Name the school (e.g. "CEG HOUETO") + paste the config block.
4. Save. The school appears in your list.
5. Tap the school → log in with your vendor credentials.

   > **IMPORTANT**: Your email+password must exist in that school's
   > Firebase Auth as an admin user. If you haven't added yourself
   > yet, the login will fail. Either add yourself as an admin in
   > Firebase console → Authentication, OR through RT-SC's normal
   > admin signup flow with the master passkey.

6. Configure FedaPay key, price, duration, WhatsApp number → Enregistrer.
7. Record the initial deadline either via "Paiement reçu" or "Redémarrer
   le cycle" → school is live.

## Multi-school deployment of RT-SC

Separate from this tool — RT-SC (the school-facing app) is cloned
per school with different Firebase configs in each folder's `.env`.
See the main RT-SC docs for the deployment script pattern
(`update_empire_rtsc.sh`).

This vendor app connects to each of those schools' Firestore from a
single deployment.

## Troubleshooting

**"Configuration Firebase invalide" when pasting**

The paste parser accepts three formats: pure JSON, JS object literal,
or `const firebaseConfig = { ... };`. If it still rejects your paste,
check:

- All required fields present: `apiKey`, `authDomain`, `projectId`
- Outer braces `{ }` included
- Values are strings (in quotes)

**Login fails with "Email ou mot de passe incorrect"**

Your credentials must exist in THIS school's Firebase Auth. Each
school is an independent Firebase project with its own user database.

**"Document non initialisé" banner**

The school doesn't have an `ecole/subscription` doc yet. Fill in the
configuration form and click "Enregistrer" — this creates the doc.

**Inputs revert while I'm typing**

Shouldn't happen — the form tracks per-field dirty flags and only
syncs from the snapshot when a field isn't being edited. If you see
this, please report with reproduction steps.

## Architecture

- `src/lib/firebase.ts` — multi-app Firebase helper
- `src/lib/schoolsStorage.ts` — localStorage-backed school list + paste parser
- `src/lib/session.tsx` — phase state machine (idle → connecting → auth → active)
- `src/lib/subscription.ts` — useSubscription hook + mutations (save, pay, reset)
- `src/ui/` — Button, Input, Textarea, SectionCard, AppShell
- `src/screens/` — SchoolSelector, AddSchoolDialog, LoginScreen, ConnectingScreen, CommandCenter

Total: ~1400 lines of hand-written code (no boilerplate dependencies).

## What's NOT here

- No in-app receipt history (each payment overwrites `deadline`; the
  FedaPay dashboard has receipts)
- No cross-school comparison view (intentional — one school at a time)
- No analytics / billing reporting (defer to FedaPay dashboard)
- No bulk operations (intentional — you pay attention to each school
  individually)
