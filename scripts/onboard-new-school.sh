#!/data/data/com.termux/files/usr/bin/bash
# shellcheck shell=bash
#
# onboard-new-school.sh
#
# Bundles the CLI steps needed to onboard a new school Firebase
# project into RT-SC. Replaces the manual copy-paste dance from
# DEPLOY-ONCE-BLAZE-IS-READY.md.
#
# What this script does:
#   1. Prompts for the new school's Firebase project ID + config alias
#   2. Registers the project with firebase CLI (firebase use --add)
#   3. Creates schools/<project-id>.json skeleton if missing
#   4. Creates functions/.env.<project-id> skeleton if missing
#   5. Prompts for HMAC_SECRET (shared across all schools) and sets it
#      via firebase functions:secrets:set
#   6. Deploys functions to the new project
#   7. Prints manual next-steps: Blaze upgrade, FedaPay webhook config,
#      first full deploy via deploy-school.sh
#
# What this script does NOT do (because it can't):
#   - Upgrade the Firebase project to Blaze plan (human click in
#     Firebase Console UI)
#   - Create the FedaPay webhook in the FedaPay dashboard (manual,
#     FedaPay has no public API for webhook creation)
#   - Bootstrap the /ecole/* docs (done via vendor-app UI after this)
#
# Usage:
#   ./scripts/onboard-new-school.sh
#
# Must be run from the RT-SC repo root.

set -euo pipefail

# ─── UI helpers ───────────────────────────────────────────────
CLR_RESET='\033[0m'
CLR_BOLD='\033[1m'
CLR_BLUE='\033[34m'
CLR_GREEN='\033[32m'
CLR_YELLOW='\033[33m'
CLR_RED='\033[31m'

info()    { printf "${CLR_BLUE}ℹ${CLR_RESET}  %s\n" "$*"; }
ok()      { printf "${CLR_GREEN}✓${CLR_RESET}  %s\n" "$*"; }
warn()    { printf "${CLR_YELLOW}⚠${CLR_RESET}  %s\n" "$*"; }
fail()    { printf "${CLR_RED}✗${CLR_RESET}  %s\n" "$*" >&2; exit 1; }
heading() { printf "\n${CLR_BOLD}%s${CLR_RESET}\n" "$*"; }

# ─── Preflight ────────────────────────────────────────────────
[[ -f "firebase.json" ]] || fail "Run this from the RT-SC repo root."
[[ -d "schools" ]]       || fail "schools/ directory missing."
[[ -d "functions" ]]     || fail "functions/ directory missing."
command -v firebase >/dev/null 2>&1 || fail "firebase CLI not installed."

heading "RT-SC · Onboard new school"
info "This script sets up the CLI state needed for a new Firebase"
info "project. It does NOT create the Firebase project itself — do"
info "that at https://console.firebase.google.com first."
echo

# ─── Collect inputs ───────────────────────────────────────────
read -rp "Firebase project ID (e.g. schoolconnect-newschool): " PROJECT_ID
[[ -z "$PROJECT_ID" ]] && fail "Project ID required."

read -rp "Short alias for this school (e.g. newschool): " ALIAS
[[ -z "$ALIAS" ]] && fail "Alias required."

read -rp "Human-readable school name (e.g. CEG Lumière): " SCHOOL_NAME
[[ -z "$SCHOOL_NAME" ]] && fail "School name required."

echo
info "Project ID : $PROJECT_ID"
info "Alias      : $ALIAS"
info "School     : $SCHOOL_NAME"
echo
read -rp "Proceed? [y/N] " CONFIRM
[[ "$CONFIRM" =~ ^[Yy]$ ]] || fail "Cancelled."

# ─── Step 1: Register with firebase CLI ───────────────────────
heading "Step 1 — Register with firebase CLI"
if firebase use --project "$PROJECT_ID" >/dev/null 2>&1; then
  ok "Project $PROJECT_ID already reachable via firebase CLI."
else
  info "Running: firebase use --add $PROJECT_ID"
  info "Follow the prompts — pick $PROJECT_ID from the list, alias = $ALIAS."
  firebase use --add
fi

# Set as active
firebase use "$ALIAS" >/dev/null 2>&1 || firebase use "$PROJECT_ID" >/dev/null 2>&1 || true

# ─── Step 2: Create schools/<project-id>.json skeleton ────────
heading "Step 2 — Create schools/$PROJECT_ID.json"
SCHOOLS_CONFIG="schools/$PROJECT_ID.json"
if [[ -f "$SCHOOLS_CONFIG" ]]; then
  ok "$SCHOOLS_CONFIG already exists — not overwriting."
else
  info "Creating skeleton $SCHOOLS_CONFIG"
  cat > "$SCHOOLS_CONFIG" <<EOF
{
  "projectId": "$PROJECT_ID",
  "alias": "$ALIAS",
  "schoolName": "$SCHOOL_NAME",
  "shortName": "$ALIAS"
}
EOF
  ok "Created $SCHOOLS_CONFIG"
fi

# ─── Step 3: Create functions/.env.<project-id> skeleton ──────
heading "Step 3 — Create functions/.env.$PROJECT_ID"
ENV_FILE="functions/.env.$PROJECT_ID"
if [[ -f "$ENV_FILE" ]]; then
  ok "$ENV_FILE already exists — not overwriting."
else
  info "Creating skeleton $ENV_FILE"
  cat > "$ENV_FILE" <<EOF
# Per-school runtime config for Cloud Functions.
# Loaded automatically by Firebase CLI when deploying to $PROJECT_ID.

# App URL for email CTAs and redirects
SCHOOL_APP_URL=https://$PROJECT_ID.web.app

# Email sender identity
EMAIL_FROM=SchoolConnect <onboarding@resend.dev>
RESEND_API_KEY=

# SaaS master email allowlist (comma-separated).
# These are the emails allowed to become SaaSMaster for THIS school
# via the setSaaSMasterClaim callable. Put your ops email here.
# You can add multiple emails separated by commas if you ever need
# to hand off. Must match an Auth account you've created in this
# school's Firebase Auth.
SAAS_MASTER_EMAILS=

# FedaPay settings
SUBSCRIPTION_MONTHS_PER_PAYMENT=1
EOF
  ok "Created $ENV_FILE"
  warn "Edit $ENV_FILE to fill in:"
  warn "  - SAAS_MASTER_EMAILS (your ops email for this school)"
  warn "  - RESEND_API_KEY if using emails"
fi

# ─── Step 4: HMAC_SECRET ──────────────────────────────────────
heading "Step 4 — Set HMAC_SECRET for this project"
info "HMAC_SECRET is shared across all schools — the same value"
info "used by your other schools. Keep it consistent so a single"
info "rotation invalidates all outstanding tokens."
echo
read -rp "Set HMAC_SECRET now? [y/N] " SET_HMAC
if [[ "$SET_HMAC" =~ ^[Yy]$ ]]; then
  info "Running: firebase functions:secrets:set HMAC_SECRET --project $PROJECT_ID"
  firebase functions:secrets:set HMAC_SECRET --project "$PROJECT_ID"
  ok "HMAC_SECRET set."
else
  warn "Skipped. Run manually before deploying functions:"
  warn "  firebase functions:secrets:set HMAC_SECRET --project $PROJECT_ID"
fi

# ─── Step 5: Deploy functions ─────────────────────────────────
heading "Step 5 — Deploy functions"
read -rp "Deploy functions to $PROJECT_ID now? [y/N] " DO_DEPLOY
if [[ "$DO_DEPLOY" =~ ^[Yy]$ ]]; then
  info "Running: firebase deploy --only functions --project $PROJECT_ID"
  firebase deploy --only functions --project "$PROJECT_ID"
  ok "Functions deployed."
else
  warn "Skipped. Run manually:"
  warn "  firebase deploy --only functions --project $PROJECT_ID"
fi

# ─── Final reminders ──────────────────────────────────────────
heading "Manual steps remaining (not scriptable)"
cat <<EOF

${CLR_BOLD}1.${CLR_RESET} If not already done, upgrade $PROJECT_ID to Blaze plan:
    → https://console.firebase.google.com/project/$PROJECT_ID/usage/details
    Click "Modify plan" → Blaze.
    Set a \$5/month budget alert.

${CLR_BOLD}2.${CLR_RESET} Create the FedaPay webhook for this school:
    → In your FedaPay dashboard (one account covers all schools):
    Settings → Webhooks → Create webhook
    URL: https://us-central1-$PROJECT_ID.cloudfunctions.net/fedapayWebhook
    Events: transaction.approved
    → FedaPay shows you a signing secret. Copy it.
    → Run:
      firebase functions:secrets:set FEDAPAY_WEBHOOK_SECRET --project $PROJECT_ID
      (paste the signing secret when prompted)
    → Redeploy functions to pick up the secret:
      firebase deploy --only functions --project $PROJECT_ID

${CLR_BOLD}3.${CLR_RESET} Bootstrap school data via the vendor-app:
    → Open vendor-app
    → Add school → paste the Firebase config for $PROJECT_ID
    → Log in (ludoskyazon@gmail.com) — this sets the saasMaster
      custom claim via setSaaSMasterClaim callable
    → Go to Bootstrap screen → fill in the form → submit
    → /ecole/**, /professeurs/{adminUid}, etc are all seeded

${CLR_BOLD}4.${CLR_RESET} Deploy hosting + rules:
    ./deploy-school.sh schools/$PROJECT_ID.json

${CLR_BOLD}5.${CLR_RESET} Test end-to-end:
    → Log in as admin in RT-SC
    → Verify the admin can read their dashboard
    → Try (DevTools) to extend their own deadline → should be rejected

EOF
ok "Onboarding preparation complete for $PROJECT_ID."
