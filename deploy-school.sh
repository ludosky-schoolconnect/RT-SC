#!/usr/bin/env bash
#
# RT-SC · deploy-school.sh
#
# Build and deploy RT-SC for ONE school. Takes a Firebase config JSON
# file + optional deploy target flags. Writes .env.production from the
# config, runs the production build, then firebase deploy.
#
# ─── USAGE ──────────────────────────────────────────────────────────
#
#   ./deploy-school.sh <firebase-config.json> [--project PROJECT_ID]
#                                             [--hosting-only]
#                                             [--rules-only]
#                                             [--dry-run]
#
# Examples:
#
#   # Full deploy (hosting + rules) using the projectId from the config
#   ./deploy-school.sh schools/ceg-houeto.json
#
#   # Deploy to a specific Firebase project (overrides config's projectId)
#   ./deploy-school.sh config.json --project my-firebase-project
#
#   # Deploy only the hosting bundle (skip Firestore rules update)
#   ./deploy-school.sh config.json --hosting-only
#
#   # Deploy only the Firestore rules (skip frontend build)
#   ./deploy-school.sh config.json --rules-only
#
#   # See what the script WOULD do without actually deploying
#   ./deploy-school.sh config.json --dry-run
#
# ─── CONFIG FILE FORMAT ─────────────────────────────────────────────
#
# The script accepts either:
#
#   (a) The Firebase web config as a JSON OBJECT:
#       {
#         "apiKey": "...",
#         "authDomain": "...",
#         "projectId": "schoolconnect-xxx",
#         "storageBucket": "...",
#         "messagingSenderId": "...",
#         "appId": "..."
#       }
#
#   (b) A wrapper object with vendor metadata:
#       {
#         "name": "CEG HOUETO",
#         "config": { ... firebase config ... }
#       }
#
# Both forms work. The script extracts the actual Firebase config.
#
# ─── PREREQUISITES ──────────────────────────────────────────────────
#
#   - Node.js 18+ and npm installed
#   - Firebase CLI installed globally: npm i -g firebase-tools
#   - Signed in: firebase login
#   - `jq` installed for JSON parsing: apt install jq (or brew, or pkg)
#   - You have write access to the target Firebase project
#
# ─── WHAT IT DOES ───────────────────────────────────────────────────
#
# 1. Parses the Firebase config from the given JSON file
# 2. Writes .env.production (git-ignored) with VITE_FB_* variables
# 3. Runs `npm run build` which runs `tsc -b && vite build` → dist/
# 4. Runs `firebase deploy --project <id> --only hosting,firestore:rules`
# 5. Prints the live URL
#
# Safe to re-run — writes are idempotent. .env.production is overwritten
# on every invocation so the build always has fresh values.
#

set -euo pipefail

# ─── Parse args ─────────────────────────────────────────────────────

CONFIG_FILE=""
PROJECT_OVERRIDE=""
MODE="full"         # full | hosting | rules
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project)
      PROJECT_OVERRIDE="$2"
      shift 2
      ;;
    --hosting-only)
      MODE="hosting"
      shift
      ;;
    --rules-only)
      MODE="rules"
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    -h|--help)
      head -60 "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      if [[ -z "$CONFIG_FILE" ]]; then
        CONFIG_FILE="$1"
      else
        echo "Unknown argument: $1" >&2
        exit 1
      fi
      shift
      ;;
  esac
done

if [[ -z "$CONFIG_FILE" ]]; then
  echo "Error: must provide a Firebase config JSON file as first argument." >&2
  echo "Run with -h for help." >&2
  exit 1
fi

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "Error: file not found: $CONFIG_FILE" >&2
  echo "" >&2
  echo "You need a config file at that path. Two ways to create it:" >&2
  echo "" >&2
  echo "  1. Via script (creates Firebase project + config file):" >&2
  echo "     ./create-school-project.sh <project-id> \"<Display Name>\"" >&2
  echo "" >&2
  echo "  2. Manually, if the Firebase project already exists:" >&2
  echo "     mkdir -p schools" >&2
  echo "     nano $CONFIG_FILE    # paste the wrapper JSON:" >&2
  echo "     {" >&2
  echo "       \"name\": \"Display Name\"," >&2
  echo "       \"config\": { \"apiKey\": \"...\", \"projectId\": \"...\", ... }" >&2
  echo "     }" >&2
  echo "" >&2
  echo "  The config block comes from Firebase Console → Project Settings →" >&2
  echo "  Your apps → Web app → SDK setup and configuration → Config." >&2
  exit 1
fi

# ─── Prerequisite checks ────────────────────────────────────────────

if ! command -v jq >/dev/null 2>&1; then
  echo "Error: 'jq' is required but not installed." >&2
  echo "  Debian/Ubuntu: sudo apt install jq" >&2
  echo "  macOS:         brew install jq" >&2
  echo "  Termux:        pkg install jq" >&2
  exit 1
fi

if ! command -v firebase >/dev/null 2>&1; then
  echo "Error: firebase CLI not installed." >&2
  echo "  Install: npm install -g firebase-tools" >&2
  echo "  Sign in: firebase login" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is not installed (Node.js 18+ required)." >&2
  exit 1
fi

# ─── Extract Firebase config ────────────────────────────────────────

# Detect wrapper format ({ name, config }) vs raw config, extract .config
# if wrapper, else use the root object.
CONFIG_JSON=$(jq 'if (has("config")) then .config else . end' "$CONFIG_FILE")

required_keys=(apiKey authDomain projectId)
for key in "${required_keys[@]}"; do
  val=$(echo "$CONFIG_JSON" | jq -r ".$key // empty")
  if [[ -z "$val" ]]; then
    echo "Error: Firebase config missing required key: $key" >&2
    exit 1
  fi
done

PROJECT_ID=$(echo "$CONFIG_JSON" | jq -r '.projectId')
if [[ -n "$PROJECT_OVERRIDE" ]]; then
  PROJECT_ID="$PROJECT_OVERRIDE"
fi

SCHOOL_NAME=$(jq -r '.name // "Unnamed"' "$CONFIG_FILE")

echo "╭─────────────────────────────────────────────────────────────"
echo "│ RT-SC · Deploy"
echo "├─────────────────────────────────────────────────────────────"
echo "│ School:    $SCHOOL_NAME"
echo "│ Project:   $PROJECT_ID"
echo "│ Mode:      $MODE"
echo "│ Config:    $CONFIG_FILE"
[[ "$DRY_RUN" == true ]] && echo "│ DRY RUN:   no side effects will be made"
echo "╰─────────────────────────────────────────────────────────────"

# ─── Write .env.production ──────────────────────────────────────────

if [[ "$MODE" != "rules" ]]; then
  ENV_FILE=".env.production"

  if [[ "$DRY_RUN" == true ]]; then
    echo "[dry-run] Would write $ENV_FILE with VITE_FB_* variables"
  else
    apiKey=$(echo "$CONFIG_JSON" | jq -r '.apiKey')
    authDomain=$(echo "$CONFIG_JSON" | jq -r '.authDomain')
    storageBucket=$(echo "$CONFIG_JSON" | jq -r '.storageBucket // empty')
    messagingSenderId=$(echo "$CONFIG_JSON" | jq -r '.messagingSenderId // empty')
    appId=$(echo "$CONFIG_JSON" | jq -r '.appId // empty')
    databaseURL=$(echo "$CONFIG_JSON" | jq -r '.databaseURL // empty')

    # Preserve VITE_OWNER_UID if already set in .env.local (it's your
    # personal value, not per-school). Grab from the existing env if
    # present, otherwise default to empty.
    owner_uid=""
    if [[ -f ".env.local" ]]; then
      owner_uid=$(grep -E '^VITE_OWNER_UID=' .env.local | cut -d= -f2- || true)
    fi

    cat > "$ENV_FILE" <<EOF
# RT-SC production build config — generated by deploy-school.sh
# School: $SCHOOL_NAME
# Project: $PROJECT_ID
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# Do not commit. Do not edit by hand — rerun the script.

VITE_FB_API_KEY=$apiKey
VITE_FB_AUTH_DOMAIN=$authDomain
VITE_FB_PROJECT_ID=$PROJECT_ID
VITE_FB_STORAGE_BUCKET=$storageBucket
VITE_FB_MESSAGING_SENDER_ID=$messagingSenderId
VITE_FB_APP_ID=$appId
VITE_FB_DATABASE_URL=$databaseURL
VITE_OWNER_UID=$owner_uid
EOF
    echo "✓ Wrote $ENV_FILE"
  fi
fi

# ─── Per-school manifest.json ───────────────────────────────────────
#
# The PWA manifest controls how the site appears when installed to the
# user's home screen (icon name, splash color, scope). Each school
# should install with ITS name — not the generic "SchoolConnect" — so
# users with apps for multiple schools can tell them apart.
#
# We overwrite public/manifest.json with a school-flavored version
# before build. Vite copies public/* to dist/ as-is, so the
# overwritten file ships in the build output. We restore the generic
# manifest after deploy via trap so other deploys aren't affected.

if [[ "$MODE" != "rules" ]]; then
  MANIFEST_PATH="public/manifest.json"
  MANIFEST_BACKUP="public/manifest.json.bak"

  if [[ -f "$MANIFEST_PATH" && "$DRY_RUN" != true ]]; then
    cp "$MANIFEST_PATH" "$MANIFEST_BACKUP"
    # Shorter name for the home-screen label — Android truncates past
    # ~12 chars, iOS past ~14. Keep the full school name in `name`,
    # use a compact version for `short_name`.
    SHORT_NAME=$(echo "$SCHOOL_NAME" | cut -c 1-14)
    cat > "$MANIFEST_PATH" <<EOF
{
  "name": "$SCHOOL_NAME — SchoolConnect",
  "short_name": "$SHORT_NAME",
  "description": "Espace numérique de $SCHOOL_NAME — bulletins, paiements, absences, communication.",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#0B2545",
  "theme_color": "#0B2545",
  "lang": "fr",
  "icons": [
    {
      "src": "/favicon.svg",
      "sizes": "192x192 512x512 any",
      "type": "image/svg+xml",
      "purpose": "any maskable"
    }
  ]
}
EOF
    echo "✓ Wrote $MANIFEST_PATH (school-specific)"

    # Restore the generic manifest after this script exits, regardless
    # of whether it succeeded — keeps the working tree clean for the
    # next school deploy / commit.
    trap 'mv "'"$MANIFEST_BACKUP"'" "'"$MANIFEST_PATH"'" 2>/dev/null || true' EXIT
  elif [[ "$DRY_RUN" == true ]]; then
    echo "[dry-run] Would write $MANIFEST_PATH with name=\"$SCHOOL_NAME — SchoolConnect\""
  fi
fi

# ─── Build ──────────────────────────────────────────────────────────

if [[ "$MODE" != "rules" ]]; then
  if [[ "$DRY_RUN" == true ]]; then
    echo "[dry-run] Would run: npm run build"
  else
    echo "→ Running: npm run build"
    npm run build
    if [[ ! -d "dist" ]]; then
      echo "Error: build did not produce a dist/ directory." >&2
      exit 1
    fi
    echo "✓ Build complete"
  fi
fi

# ─── Deploy ─────────────────────────────────────────────────────────

DEPLOY_FLAGS=()
case "$MODE" in
  full)    DEPLOY_FLAGS+=(--only hosting,firestore:rules) ;;
  hosting) DEPLOY_FLAGS+=(--only hosting) ;;
  rules)   DEPLOY_FLAGS+=(--only firestore:rules) ;;
esac

if [[ "$DRY_RUN" == true ]]; then
  echo "[dry-run] Would run: firebase deploy --project $PROJECT_ID ${DEPLOY_FLAGS[*]}"
else
  echo "→ Running: firebase deploy --project $PROJECT_ID ${DEPLOY_FLAGS[*]}"
  firebase deploy --project "$PROJECT_ID" "${DEPLOY_FLAGS[@]}"
fi

# ─── Done ───────────────────────────────────────────────────────────

if [[ "$DRY_RUN" == false ]]; then
  echo ""
  echo "╭─────────────────────────────────────────────────────────────"
  echo "│ ✓ Deployed $SCHOOL_NAME"
  echo "│ Live at: https://$PROJECT_ID.web.app"
  echo "│     and: https://$PROJECT_ID.firebaseapp.com"
  echo "╰─────────────────────────────────────────────────────────────"
fi
