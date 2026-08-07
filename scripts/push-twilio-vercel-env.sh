#!/usr/bin/env bash
# Push Twilio SMS env vars to Vercel (fitdog-gingr-status-board).
# Usage:
#   export TWILIO_ACCOUNT_SID=AC...
#   export TWILIO_AUTH_TOKEN=...
#   export TWILIO_FROM_NUMBER=+1...
#   export TWILIO_MESSAGING_SERVICE_SID=MG...   # preferred for A2P / toll-free
#   ./scripts/push-twilio-vercel-env.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/.vercel"
if [[ ! -f "$ROOT/.vercel/project.json" ]]; then
  cat > "$ROOT/.vercel/project.json" <<'JSON'
{"projectId":"prj_I6u5R1K459xYYLgQBZcqkzGOTI2Y","orgId":"team_pZmkcBCLvED2dwV2sZ6CwLuw","projectName":"fitdog-gingr-status-board"}
JSON
fi

need() {
  local key="$1"
  if [[ -z "${!key:-}" ]]; then
    echo "ERROR: $key is required."
    exit 1
  fi
}

need TWILIO_ACCOUNT_SID
need TWILIO_AUTH_TOKEN
if [[ -z "${TWILIO_MESSAGING_SERVICE_SID:-}" && -z "${TWILIO_FROM_NUMBER:-}" ]]; then
  echo "ERROR: set TWILIO_MESSAGING_SERVICE_SID and/or TWILIO_FROM_NUMBER."
  exit 1
fi

set_env() {
  local key="$1"
  local value="$2"
  local env_name="$3"
  echo "  - $key ($env_name)"
  npx --yes vercel@56.4.0 env rm "$key" "$env_name" --yes >/dev/null 2>&1 || true
  printf '%s' "$value" | npx --yes vercel@56.4.0 env add "$key" "$env_name" >/dev/null
}

echo "Pushing Twilio env to Vercel..."
for env_name in production preview development; do
  set_env TWILIO_ACCOUNT_SID "$TWILIO_ACCOUNT_SID" "$env_name"
  set_env TWILIO_AUTH_TOKEN "$TWILIO_AUTH_TOKEN" "$env_name"
  if [[ -n "${TWILIO_FROM_NUMBER:-}" ]]; then
    set_env TWILIO_FROM_NUMBER "$TWILIO_FROM_NUMBER" "$env_name"
  fi
  if [[ -n "${TWILIO_MESSAGING_SERVICE_SID:-}" ]]; then
    set_env TWILIO_MESSAGING_SERVICE_SID "$TWILIO_MESSAGING_SERVICE_SID" "$env_name"
  fi
done

echo "Done. Redeploy production so runtime picks up new values:"
echo "  npx vercel --prod --scope bridge-tess"
