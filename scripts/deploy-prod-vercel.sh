#!/usr/bin/env bash
# Production deploy for fitdog-gingr-status-board + custom domain aliases.
#
# Usage:
#   export VERCEL_TOKEN=...   # https://vercel.com/account/tokens
#   ./scripts/deploy-prod-vercel.sh
#
# Optional:
#   VERCEL_SCOPE=bridge-tess
#   SKIP_ALIAS=true           # deploy only, do not re-alias domains
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TOKEN="${VERCEL_TOKEN:-}"
if [[ -z "${TOKEN// }" ]]; then
  echo "ERROR: VERCEL_TOKEN is missing or empty."
  echo "Create one at https://vercel.com/account/tokens then:"
  echo "  export VERCEL_TOKEN=..."
  echo "  ./scripts/deploy-prod-vercel.sh"
  exit 1
fi

SCOPE="${VERCEL_SCOPE:-bridge-tess}"

mkdir -p "$ROOT/.vercel"
if [[ ! -f "$ROOT/.vercel/project.json" ]]; then
  cat > "$ROOT/.vercel/project.json" <<'JSON'
{"projectId":"prj_I6u5R1K459xYYLgQBZcqkzGOTI2Y","orgId":"team_pZmkcBCLvED2dwV2sZ6CwLuw","projectName":"fitdog-gingr-status-board"}
JSON
fi

echo "Deploying production (scope=$SCOPE)..."
DEPLOY_OUT="$(mktemp)"
if ! npx --yes vercel@latest --prod --token "$TOKEN" --scope "$SCOPE" --yes | tee "$DEPLOY_OUT"; then
  rm -f "$DEPLOY_OUT"
  echo "ERROR: vercel production deploy failed."
  exit 1
fi

DEPLOY_HOST="$(
  awk '
    /https:\/\/fitdog-gingr-status-board-[a-z0-9-]+\.vercel\.app/ {
      for (i = 1; i <= NF; i++) {
        if ($i ~ /https:\/\/fitdog-gingr-status-board-[a-z0-9-]+\.vercel\.app/) {
          gsub(/^https:\/\//, "", $i)
          gsub(/[^a-zA-Z0-9.-].*$/, "", $i)
          print $i
          exit
        }
      }
    }
  ' "$DEPLOY_OUT"
)"
rm -f "$DEPLOY_OUT"

if [[ -z "${DEPLOY_HOST:-}" ]]; then
  echo "ERROR: could not resolve production deployment host from CLI output."
  exit 1
fi

echo "Production deployment: https://$DEPLOY_HOST"

if [[ "${SKIP_ALIAS:-false}" == "true" ]]; then
  echo "SKIP_ALIAS=true — leaving custom domains unchanged."
  exit 0
fi

echo "Aliasing custom domains..."
for domain in fitdog.ruffops.com staff.ruffops.com lobby.ruffops.com casttv.ruffops.com; do
  echo "  - $domain"
  npx --yes vercel@latest alias set "$DEPLOY_HOST" "$domain" --token "$TOKEN" --scope "$SCOPE"
done

echo
echo "Done. Live on:"
echo "  https://staff.ruffops.com"
echo "  https://fitdog.ruffops.com"
echo "  https://lobby.ruffops.com"
echo "  https://casttv.ruffops.com"
