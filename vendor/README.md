# Vendor Command Center (dev.html)

This is a standalone HTML file — Ludosky's vendor tool for managing
every school's SchoolConnect subscription. It's completely separate
from the RT-SC app (no React, no build process, just a single .html
with inline JS that talks directly to each school's Firestore).

## What it does

- Lists every school Ludosky has onboarded (configured in the
  `schoolsData` object at the top of the file)
- Lets Ludosky:
  - Switch between schools via dropdown
  - See each school's current deadline + lock status + unlock request flag
  - Configure per-school: FedaPay key, price, duration in months, WhatsApp support number
  - Record a payment → extends the deadline (with fairness logic
    matching RT-SC: extends from deadline if early, from today if late)
  - Clear the "paid externally" alert
  - Reset the subscription cycle to today
  - Manually lock/unlock a school (e.g. to suspend access on demand)

## Adding a new school

Edit the `schoolsData` object at the top of `dev.html`:

```javascript
const schoolsData = {
    "ecole1": {
        name: "🏫 École Alpha",
        config: { /* Firebase web config from that school's Firebase project */ }
    },
    "ceg_houeto": {
        name: "🏫 CEG HOUETO",
        config: {
            apiKey: "...",
            authDomain: "...",
            projectId: "...",
            storageBucket: "...",
            messagingSenderId: "...",
            appId: "..."
        }
    },
    // Add more schools here
};
```

The config object is the Firebase web config — Firebase console →
project settings → Your apps → web app → "Config" section.

## Access & hosting options

Three options, pick one:

### Option A — Host on RT-SC's domain at an obscure path (RECOMMENDED)

Deploy `dev.html` alongside RT-SC on Firebase Hosting, but at an
obscure URL only you know, like:
```
https://schoolconnect-beninland.app/__vendor/dashboard.html
```

Add to your `firebase.json` hosting config:
```json
{
  "hosting": {
    "public": "dist",
    "rewrites": [
      { "source": "/__vendor/dashboard.html", "destination": "/dev.html" }
    ]
  }
}
```

Or just drop `dev.html` into your `public/` directory and deploy. The
`<meta name="robots" content="noindex, nofollow">` tag in the file
prevents search engines from indexing it.

**Security**: anyone who knows the URL can reach the login page, but
the Firebase Auth gate requires your developer email + password. Even
with the URL, they can't do anything without your credentials.

### Option B — Separate subdomain

Deploy to a totally different host:
```
https://vendor.schoolconnect-beninland.app/
```

Separate Firebase Hosting site, separate GitHub Pages repo, Netlify,
whatever. Clean isolation from the main product.

### Option C — Local only, never hosted

Run it from your device:
```bash
# Open directly in browser
file:///path/to/dev.html

# Or via a quick local server (Termux)
python3 -m http.server 8080 --directory /path/to/vendor
# Then visit http://localhost:8080/dev.html
```

Maximum security — the tool doesn't exist on the internet at all.
You must be on your device to use it. Only viable if you're always
near your Termux setup when a school needs managing.

## First-time setup

1. Edit `schoolsData` with all your schools' Firebase configs
2. Pick a hosting option (A, B, or C)
3. Deploy
4. Visit the URL → log in with your vendor email + password (the
   credentials that authenticate for EVERY school's Firebase Auth
   — they must be registered as admin in each school's Firebase Auth
   with the proper custom claim / UID allow-list)
5. Once logged in, pick a school and configure:
   - FedaPay key (`pk_live_...`)
   - Subscription price (e.g. 15000)
   - Duration per payment (e.g. 1, 3, 6, 12 months)
   - WhatsApp number (e.g. `22990123456`)
6. Click "💾 Enregistrer la configuration"

## On the WhatsApp number

Same number for every school (it's YOUR support number, not each
school's). You'll paste the same value into every school's
configuration. The RT-SC LockedPage reads it from each school's
`ecole/subscription.supportWhatsAppNumber` and shows a "Contacter
sur WhatsApp" button that opens wa.me with a pre-filled message
identifying which school is contacting you.

Format: international dialling code + number, digits only.
For Bénin: `229` + 8-digit number → `22990123456`.

The tool accepts any format you paste in (`+229 90 12 34 56` with
spaces and +, etc.) — it strips non-digits automatically.

## Fields stored at /ecole/subscription

The tool writes these fields to each school's Firestore:

- `fedaPayPublicKey` (string) — FedaPay public key for this school
- `subscriptionPrice` (number) — price in FCFA (e.g. 15000)
- `subscriptionDurationMonths` (number) — months added per payment
- `supportWhatsAppNumber` (string) — WhatsApp number, digits only
- `deadline` (Timestamp) — when access expires
- `isManualLock` (boolean) — vendor override to lock access
- `hasRequestedUnlock` (boolean) — set by admin tapping "Signaler un
  paiement externe" in RT-SC. Tool shows a 🔔 alert when true.

## Troubleshooting

**"Erreur : identifiants incorrects" on login**

You must use an email+password that's registered as a Firebase Auth
user in EVERY school's Firebase project. If a new school was onboarded
but you haven't added yourself as an admin in its Firebase Auth, the
tool will fail to log in to that school's project. Either add
yourself as an admin user to every school's Firebase Auth, OR remove
the school from `schoolsData` temporarily while fixing.

**"Base non initialisée" for a school**

That school's Firestore has no `/ecole/subscription` document yet.
This is normal for a new school. The first click on "Enregistrer la
configuration" creates it. Make sure to set all 4 fields the first
time, not just one.

**Inputs wiping out mid-typing**

Shouldn't happen — the listener only updates inputs when they are NOT
currently focused. If it does, let me know and I'll debug.
