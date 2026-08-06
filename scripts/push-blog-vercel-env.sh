#!/usr/bin/env bash
# Push Fitdog public blog env vars to Vercel Production (fitdog-gingr-status-board).
# Usage:
#   export VERCEL_TOKEN=...
#   ./scripts/push-blog-vercel-env.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ -z "${VERCEL_TOKEN:-}" ]]; then
  echo "ERROR: VERCEL_TOKEN is required (https://vercel.com/account/tokens)."
  exit 1
fi

mkdir -p "$ROOT/.vercel"
if [[ ! -f "$ROOT/.vercel/project.json" ]]; then
  cat > "$ROOT/.vercel/project.json" <<'JSON'
{"projectId":"prj_I6u5R1K459xYYLgQBZcqkzGOTI2Y","orgId":"team_pZmkcBCLvED2dwV2sZ6CwLuw","projectName":"fitdog-gingr-status-board"}
JSON
fi

VERCEL_SCOPE_ARGS=(--token "$VERCEL_TOKEN" --scope bridge-tess)

set_env() {
  local key="$1"
  local value="$2"
  local env_name="${3:-production}"
  echo "  - $key ($env_name)"
  npx --yes vercel@41.7.8 env rm "$key" "$env_name" "${VERCEL_SCOPE_ARGS[@]}" --yes >/dev/null 2>&1 || true
  printf '%s' "$value" | npx --yes vercel@41.7.8 env add "$key" "$env_name" "${VERCEL_SCOPE_ARGS[@]}" >/dev/null
}

echo "Pushing Fitdog blog env to Vercel production..."
set_env NEXT_PUBLIC_PUBLIC_SITE_URL "https://blogs.ruffops.com" production
set_env BLOG_LEGACY_REDIRECT "false" production

echo "Done. Trigger a production redeploy so env vars take effect:"
echo "  npx vercel --prod --token \"\$VERCEL_TOKEN\" --scope bridge-tess"
