#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# deploy-vendor.sh
#
# Builds vendor-app and deploys it to Firebase Hosting.
#
# The vendor app is YOUR internal tool for managing schools —
# keep it on a dedicated, obscure URL (not your schools' domain).
#
# Usage:
#   ./deploy-vendor.sh <firebase-hosting-project-id>
#
# Example:
#   ./deploy-vendor.sh schoolconnect-vendor-tools
#
# Prerequisites:
#   - firebase-tools installed globally:  npm install -g firebase-tools
#   - firebase login:  firebase login
#   - A Firebase project that has Hosting enabled
# ──────────────────────────────────────────────────────────────

set -euo pipefail

PROJECT_ID="${1:-}"

if [[ -z "$PROJECT_ID" ]]; then
  echo "❌ Usage: $0 <firebase-hosting-project-id>" >&2
  echo "   Example: $0 schoolconnect-vendor-tools" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENDOR_DIR="$REPO_ROOT/vendor-app"

if [[ ! -d "$VENDOR_DIR" ]]; then
  echo "❌ vendor-app/ directory not found at $VENDOR_DIR" >&2
  exit 1
fi

cd "$VENDOR_DIR"

# Write a minimal firebase.json if it doesn't exist yet — SPA rewrites
# + noindex headers so search engines never find this URL.
if [[ ! -f "firebase.json" ]]; then
  echo "ℹ️  Creating vendor-app/firebase.json"
  cat > firebase.json <<'JSON'
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
JSON
fi

echo "📦 Installing vendor-app dependencies…"
npm install --silent

echo "🔨 Building vendor-app…"
npm run build

echo "🚀 Deploying to Firebase project: $PROJECT_ID"
npx firebase deploy \
  --only hosting \
  --project "$PROJECT_ID" \
  --non-interactive

echo ""
echo "✅ Vendor app deployed."
echo "   URL: https://$PROJECT_ID.web.app"
echo ""
echo "💡 For extra obscurity, bookmark this URL privately. Do NOT"
echo "   share it with schools — it's your management console."
