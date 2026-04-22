#!/usr/bin/env bash
#
# RT-SC · create-school-project.sh
#
# Creates a brand-new Firebase project from scratch using the Firebase
# CLI, adds a web app to it, enables the needed Firebase products,
# and dumps the resulting config to a JSON file ready to feed into
# deploy-school.sh.
#
# ─── USAGE ──────────────────────────────────────────────────────────
#
#   ./create-school-project.sh <project-id> <display-name> [output.json]
#
# Examples:
#
#   ./create-school-project.sh sc-ceg-houeto "CEG HOUETO"
#   ./create-school-project.sh sc-ecole-beta "École Beta" schools/ecole-beta.json
#
# If output.json is omitted, defaults to schools/<project-id>.json
#
# ─── WHAT IT DOES ───────────────────────────────────────────────────
#
# 1. Creates Firebase project via: firebase projects:create
# 2. Adds a web app to the project
# 3. Retrieves the web app's config via: firebase apps:sdkconfig
# 4. Writes the config to the output JSON file in vendor-bootstrap format:
#      { "name": "<display-name>", "config": { ...firebase config... } }
# 5. Tells you what to do next:
#      - Open Firebase Console to enable Email/Password sign-in
#      - Enable Firestore
#      - Run vendor-app to bootstrap
#      - Run deploy-school.sh to deploy
#
# ─── IMPORTANT CAVEATS ──────────────────────────────────────────────
#
# - Firebase CLI can CREATE projects but cannot enable Firestore or
#   Authentication providers. Those still require a click in the
#   Firebase Console (one-time per project).
#
# - Firebase projects count against your Google Cloud quota. The
#   Spark/free plan limit is typically 5-10 projects per account.
#   Past that, you need to upgrade or delete old projects.
#
# - A Google billing account must be linked to your Google account
#   for project creation, even for free-tier projects. (You don't get
#   charged; Google just needs payment info on file.)
#
# - project-id must be globally unique across all Firebase, lowercase
#   alphanumeric + hyphens, 6-30 chars. Pick something descriptive.
#
# ─── PREREQUISITES ──────────────────────────────────────────────────
#
#   - Firebase CLI: npm install -g firebase-tools
#   - Signed in:    firebase login
#   - jq installed (for parsing the SDK config output)
#

set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <project-id> <display-name> [output.json]" >&2
  echo "Run with -h for more help." >&2
  exit 1
fi

if [[ "$1" == "-h" || "$1" == "--help" ]]; then
  head -60 "$0" | sed 's/^# \{0,1\}//'
  exit 0
fi

PROJECT_ID="$1"
DISPLAY_NAME="$2"
OUTPUT_FILE="${3:-schools/${PROJECT_ID}.json}"

# ─── Validate project-id ────────────────────────────────────────────

if ! [[ "$PROJECT_ID" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]]; then
  echo "Error: project-id must be 6-30 chars, lowercase alphanumeric + hyphens," >&2
  echo "       start with a letter, and end with a letter or digit." >&2
  echo "Given: $PROJECT_ID" >&2
  exit 1
fi

# ─── Prerequisite checks ────────────────────────────────────────────

for cmd in firebase jq; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Error: '$cmd' is required but not installed." >&2
    exit 1
  fi
done

echo "╭─────────────────────────────────────────────────────────────"
echo "│ RT-SC · Create Firebase project"
echo "├─────────────────────────────────────────────────────────────"
echo "│ Project ID:   $PROJECT_ID"
echo "│ Display name: $DISPLAY_NAME"
echo "│ Output file:  $OUTPUT_FILE"
echo "╰─────────────────────────────────────────────────────────────"
echo ""

# ─── 1. Create project ──────────────────────────────────────────────

echo "→ Creating Firebase project..."
if firebase projects:create "$PROJECT_ID" --display-name "$DISPLAY_NAME" 2>&1 | tee /tmp/fb-create.log; then
  echo "✓ Project created"
else
  # If the only error is "already exists", continue — user may want to
  # rebuild the config JSON for an existing project.
  if grep -q "already exists" /tmp/fb-create.log; then
    echo "ℹ Project already exists — continuing with existing project"
  else
    echo "Error: project creation failed. See above." >&2
    exit 1
  fi
fi

# ─── 2. Add a web app ───────────────────────────────────────────────

echo "→ Adding web app to project..."
WEB_APP_NAME="${DISPLAY_NAME} Web"

# `firebase apps:create` prints the app ID on success. If an app with
# the same display name already exists, it'll error — list existing
# web apps and pick the first.
if firebase apps:create web "$WEB_APP_NAME" --project "$PROJECT_ID" >/tmp/fb-app.log 2>&1; then
  echo "✓ Web app created"
else
  if grep -iq "already" /tmp/fb-app.log; then
    echo "ℹ Web app already exists — will use existing"
  else
    cat /tmp/fb-app.log >&2
    echo "Error: web app creation failed." >&2
    exit 1
  fi
fi

# ─── 3. Retrieve web app SDK config ─────────────────────────────────

echo "→ Retrieving web app SDK config..."

# List web apps and grab the first appId
APP_ID=$(firebase apps:list web --project "$PROJECT_ID" --json 2>/dev/null \
  | jq -r '.result[0].appId // empty')

if [[ -z "$APP_ID" ]]; then
  echo "Error: could not find a web app in project $PROJECT_ID" >&2
  exit 1
fi

# sdkconfig outputs a JS object like `firebase.initializeApp({...})`.
# We ask for --json to get a parseable form. The exact shape is:
#   { "status": "success", "result": "{ ... firebase config ... }" }
# The `.result` field contains the config object as a JSON string.
SDK_OUTPUT=$(firebase apps:sdkconfig web "$APP_ID" --project "$PROJECT_ID" --json 2>/dev/null)

if [[ -z "$SDK_OUTPUT" ]]; then
  echo "Error: could not retrieve SDK config for app $APP_ID" >&2
  exit 1
fi

# Extract the config object. Newer Firebase CLI versions give
# `.result.sdkConfig` as the config object directly; older versions
# put the whole initializeApp() call as a string in `.result`.
CONFIG_JSON=$(echo "$SDK_OUTPUT" | jq '.result.sdkConfig // .result // empty')

# If it's still a string (older CLI), try to parse the embedded JSON
if echo "$CONFIG_JSON" | jq -e 'type == "string"' >/dev/null 2>&1; then
  # Strip the "firebase.initializeApp(...)" wrapper if present
  INNER=$(echo "$CONFIG_JSON" | jq -r '.')
  INNER=$(echo "$INNER" | sed -n 's/.*initializeApp(\(.*\)).*/\1/p')
  [[ -z "$INNER" ]] && INNER=$(echo "$CONFIG_JSON" | jq -r '.')
  CONFIG_JSON=$(echo "$INNER" | jq '.')
fi

# ─── 4. Write output JSON (vendor-bootstrap format) ─────────────────

mkdir -p "$(dirname "$OUTPUT_FILE")"

jq -n \
  --arg name "$DISPLAY_NAME" \
  --argjson config "$CONFIG_JSON" \
  '{ name: $name, config: $config }' > "$OUTPUT_FILE"

echo "✓ Wrote config to $OUTPUT_FILE"

# ─── 5. Next-step guidance ──────────────────────────────────────────

echo ""
echo "╭─────────────────────────────────────────────────────────────"
echo "│ ✓ Firebase project ready — next steps"
echo "├─────────────────────────────────────────────────────────────"
echo "│"
echo "│ 1. Open Firebase Console (one-time config):"
echo "│    https://console.firebase.google.com/project/$PROJECT_ID"
echo "│"
echo "│ 2. Enable Authentication:"
echo "│      → Authentication → Sign-in method → Email/Password → Enable"
echo "│"
echo "│ 3. Enable Firestore:"
echo "│      → Firestore Database → Create database → pick region"
echo "│        (default 'eur3' is fine for Bénin)"
echo "│      → Start in production mode (we'll deploy rules in step 5)"
echo "│"
echo "│ 4. In vendor-app: bootstrap the school"
echo "│      Add school with the config JSON, then tap ⚡ Sparkles"
echo "│      to initialize (creates admin + seed docs)"
echo "│"
echo "│ 5. Deploy RT-SC to this project:"
echo "│      ./deploy-school.sh $OUTPUT_FILE"
echo "│"
echo "│ 6. Live at: https://$PROJECT_ID.web.app"
echo "│"
echo "╰─────────────────────────────────────────────────────────────"
