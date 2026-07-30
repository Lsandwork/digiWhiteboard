#!/usr/bin/env bash
# Push Samsara + Route Generator env vars to Vercel Production (staff.ruffops.com).
# Usage:
#   export VERCEL_TOKEN=...
#   export SAMSARA_API_TOKEN='samsara_api_...'
#   ./scripts/push-samsara-vercel-env.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ -z "${VERCEL_TOKEN:-}" || -z "${VERCEL_TOKEN// }" ]]; then
  echo "ERROR: VERCEL_TOKEN is missing or empty (https://vercel.com/account/tokens)."
  echo "  export VERCEL_TOKEN=..."
  echo "  ./scripts/deploy-prod-vercel.sh"
  exit 1
fi

if [[ -z "${SAMSARA_API_TOKEN:-}" || -z "${SAMSARA_API_TOKEN// }" ]]; then
  echo "ERROR: SAMSARA_API_TOKEN is missing or empty."
  echo "Verify first: npx tsx scripts/verify-samsara-setup.ts"
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

echo "Pushing Samsara / Route Generator env to Vercel..."
for env_name in production preview development; do
  set_env SAMSARA_API_TOKEN "$SAMSARA_API_TOKEN" "$env_name"
  set_env SAMSARA_CSV_EXPORT_ENABLED "true" "$env_name"
  set_env SAMSARA_DIRECT_SYNC_ENABLED "false" "$env_name"
  set_env ROUTE_GENERATOR_ENABLED "true" "$env_name"
  set_env FITDOG_REPORT_SYNC_ENABLED "true" "$env_name"
  set_env ROUTE_OPTIMIZATION_ENABLED "true" "$env_name"
  set_env NEXT_PUBLIC_SITE_URL "https://staff.ruffops.com" "$env_name"
done

echo "Done. Trigger a production redeploy + domain alias:"
echo "  ./scripts/deploy-prod-vercel.sh"
echo
echo "Samsara token checklist:"
echo "  - Scopes: Read Vehicles, Read Vehicle Statistics (GPS)"
echo "  - Tag access: entire organization (not a tag that excludes vans)"
echo "  - Van names in Samsara: Van 01, Van 02, Van 03, Van 05, Van 06 (no Van 04)"
