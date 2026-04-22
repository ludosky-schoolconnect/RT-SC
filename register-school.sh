#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# register-school.sh
#
# Creates schools/<projectId>.json from a pasted Firebase config
# block. Use this when you created the Firebase project manually in
# the Firebase Console (instead of via create-school-project.sh).
#
# Accepts any of these pasted forms:
#
#   const firebaseConfig = {
#     apiKey: "AIza...",
#     ...
#   };
#
#   firebaseConfig = { ... };
#
#   {
#     "apiKey": "AIza...",
#     ...
#   }
#
# i.e. with or without `const`, with or without the `firebaseConfig =`
# prefix, with or without the trailing semicolon, with unquoted JS keys
# or proper JSON keys.
#
# Usage:
#   ./register-school.sh
#   (paste the block when prompted, Ctrl+D to finish, then type the
#    display name)
#
# Prerequisites: python3 (installed by default on Termux), jq (for
# final validation only).
# ──────────────────────────────────────────────────────────────

set -euo pipefail

if ! command -v python3 >/dev/null 2>&1; then
  echo "Error: python3 is required but not installed." >&2
  echo "Install with: pkg install python (Termux)" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq is required but not installed." >&2
  echo "Install with: pkg install jq (Termux)" >&2
  exit 1
fi

mkdir -p schools

echo ""
echo "── Paste the Firebase config block ─────────────────────────"
echo "(From: Firebase Console → Project Settings → Your apps →"
echo " Web app → SDK setup → Config radio → copy the JS block)"
echo ""
echo "Paste below, then press Ctrl+D when done:"
echo ""

BLOB=$(cat)

if [[ -z "$BLOB" ]]; then
  echo "Error: nothing pasted." >&2
  exit 1
fi

# Write the blob to a temp file so Python reads it reliably even if it
# contains special shell characters. More robust than string embedding.
TMP_IN=$(mktemp)
printf '%s' "$BLOB" > "$TMP_IN"
TMP_OUT=$(mktemp)
trap 'rm -f "$TMP_IN" "$TMP_OUT"' EXIT

# Parse the pasted blob using Python. It finds the first `{...}` block,
# converts JS-flavored syntax to JSON (unquoted keys, single quotes,
# trailing commas), and writes canonical JSON on stdout.
python3 - "$TMP_IN" <<'PYEOF' > "$TMP_OUT"
import sys, re, json

path = sys.argv[1]
with open(path) as f:
    blob = f.read()

# Find the first '{' and the matching '}' using a brace counter.
start = blob.find('{')
if start == -1:
    sys.stderr.write("Error: no '{' found in paste.\n")
    sys.exit(1)

depth = 0
end = -1
for i, ch in enumerate(blob[start:], start=start):
    if ch == '{':
        depth += 1
    elif ch == '}':
        depth -= 1
        if depth == 0:
            end = i + 1
            break

if end == -1:
    sys.stderr.write("Error: unterminated '{' — missing closing brace.\n")
    sys.exit(1)

obj_text = blob[start:end]

# Fast path: strict JSON (user pasted canonical JSON)
try:
    data = json.loads(obj_text)
except json.JSONDecodeError:
    # JS-flavored fallback: unquoted keys, single quotes, trailing commas.
    t = obj_text
    # Quote unquoted keys: `apiKey:` → `"apiKey":`
    t = re.sub(r'([{,\s])([a-zA-Z_][a-zA-Z0-9_]*)\s*:', r'\1"\2":', t)
    # Single-quoted strings → double-quoted
    t = re.sub(r"'([^'\\]*(?:\\.[^'\\]*)*)'", r'"\1"', t)
    # Strip trailing commas before } or ]
    t = re.sub(r',(\s*[}\]])', r'\1', t)
    try:
        data = json.loads(t)
    except json.JSONDecodeError as e:
        sys.stderr.write(f"Error: could not parse as JSON after JS-to-JSON conversion.\n")
        sys.stderr.write(f"Details: {e}\n")
        sys.stderr.write(f"Attempted text:\n{t}\n")
        sys.exit(1)

if not isinstance(data, dict):
    sys.stderr.write("Error: parsed value is not an object.\n")
    sys.exit(1)

if 'projectId' not in data:
    sys.stderr.write("Error: no 'projectId' field in the config.\n")
    sys.stderr.write(f"Got keys: {list(data.keys())}\n")
    sys.exit(1)

print(json.dumps(data))
PYEOF

# If Python exited non-zero, stderr already printed the reason.
# $? is always 0 from Python here because we'd have exited via `set -e`
# on failure above — but for safety:
if [[ ! -s "$TMP_OUT" ]]; then
  exit 1
fi

CLEAN=$(cat "$TMP_OUT")
PROJECT_ID=$(echo "$CLEAN" | jq -r '.projectId')

echo ""
echo "✓ Detected projectId: $PROJECT_ID"
echo ""
read -p "Display name (e.g. 'CEG Abomey'): " DISPLAY_NAME
if [[ -z "$DISPLAY_NAME" ]]; then
  echo "Error: display name required." >&2
  exit 1
fi

OUT="schools/${PROJECT_ID}.json"

# Build the wrapper JSON
FINAL=$(jq -n \
  --arg name "$DISPLAY_NAME" \
  --argjson cfg "$CLEAN" \
  '{ name: $name, config: $cfg }')

if [[ -f "$OUT" ]]; then
  echo ""
  echo "⚠ $OUT already exists."
  read -p "Overwrite? (y/N) " CONFIRM
  if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
    echo "Aborted."
    exit 0
  fi
fi

echo "$FINAL" | jq . > "$OUT"

echo ""
echo "✓ Wrote $OUT"
echo ""
echo "Next steps:"
echo "  ./deploy-school.sh $OUT --hosting-only  # first deploy (hosting only, leaves rules permissive)"
echo "  # → now bootstrap via vendor-app"
echo "  ./deploy-school.sh $OUT --rules-only    # after bootstrap, lock down rules"
echo ""
echo "If already bootstrapped:"
echo "  ./deploy-school.sh $OUT                 # full deploy (hosting + rules)"
