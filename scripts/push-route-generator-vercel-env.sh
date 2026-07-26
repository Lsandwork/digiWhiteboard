#!/usr/bin/env bash
# Push Route Generator + worker secrets to Vercel Production.
# Required:
#   export VERCEL_TOKEN=...
#   export GOOGLE_MAPS_API_KEY=...
# Optional:
#   export VERCEL_PROJECT_ID=...
#   export VERCEL_ORG_ID=...
#   export ROUTE_WORKER_URL=...   # if already deployed
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKER_ENV="$ROOT/.env.route-worker.local"
OUT_ENV="$(mktemp)"

if [[ -z "${VERCEL_TOKEN:-}" ]]; then
  echo "ERROR: VERCEL_TOKEN is required."
  echo "Create one at https://vercel.com/account/tokens then: export VERCEL_TOKEN=..."
  exit 1
fi

if [[ -z "${GOOGLE_MAPS_API_KEY:-}" ]]; then
  echo "ERROR: GOOGLE_MAPS_API_KEY is required."
  exit 1
fi

if [[ ! -f "$WORKER_ENV" ]]; then
  echo "ERROR: missing $WORKER_ENV — run: npm run setup:route-generator-shadow"
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$WORKER_ENV"
set +a

if [[ -z "${ROUTE_WORKER_SIGNING_SECRET:-}" || -z "${ROUTE_WORKER_CALLBACK_SECRET:-}" ]]; then
  echo "ERROR: worker secrets missing in $WORKER_ENV"
  exit 1
fi

ENABLE_FLAGS="${ENABLE_ROUTE_GENERATOR_FLAGS:-false}"

cat > "$OUT_ENV" <<EOF
ROUTE_WORKER_SIGNING_SECRET=${ROUTE_WORKER_SIGNING_SECRET}
ROUTE_WORKER_CALLBACK_SECRET=${ROUTE_WORKER_CALLBACK_SECRET}
ROUTE_WORKER_URL=${ROUTE_WORKER_URL:-}
MAPS_PROVIDER=google
GOOGLE_MAPS_API_KEY=${GOOGLE_MAPS_API_KEY}
ROUTE_GENERATOR_ENABLED=${ENABLE_FLAGS}
FITDOG_REPORT_SYNC_ENABLED=${ENABLE_FLAGS}
ROUTE_OPTIMIZATION_ENABLED=${ENABLE_FLAGS}
SAMSARA_CSV_EXPORT_ENABLED=${ENABLE_FLAGS}
SAMSARA_DIRECT_SYNC_ENABLED=false
EOF

echo "Pushing env vars to Vercel production..."
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ -z "$line" || "$line" =~ ^# ]] && continue
  key="${line%%=*}"
  value="${line#*=}"
  echo "  - $key"
  # Remove existing then add (vercel env add fails on duplicates without --force on some versions)
  npx --yes vercel@41.7.8 env rm "$key" production --token "$VERCEL_TOKEN" --yes >/dev/null 2>&1 || true
  printf '%s' "$value" | npx --yes vercel@41.7.8 env add "$key" production --token "$VERCEL_TOKEN" >/dev/null
done < "$OUT_ENV"

rm -f "$OUT_ENV"
echo "Done. Trigger a production redeploy if needed:"
echo "  npx vercel --prod --token \"\$VERCEL_TOKEN\""
if [[ "$ENABLE_FLAGS" != "true" ]]; then
  echo "Note: feature flags left false. Re-run with ENABLE_ROUTE_GENERATOR_FLAGS=true after checklist."
fi
