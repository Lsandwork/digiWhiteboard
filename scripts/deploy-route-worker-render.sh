#!/usr/bin/env bash
# Create or update the Fitdog route-worker Web Service on Render.
#
# Required:
#   export RENDER_API_KEY=...   # https://dashboard.render.com/u/settings#api-keys
# Optional:
#   export RENDER_OWNER_ID=...  # workspace id (auto-detected if omitted)
#   export RENDER_SERVICE_NAME=fitdog-route-worker
#   export RENDER_BRANCH=main
#   export RENDER_REGION=oregon
#   export RENDER_PLAN=free
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKER_ENV="$ROOT/.env.route-worker.local"
SERVICE_NAME="${RENDER_SERVICE_NAME:-fitdog-route-worker}"
REPO_URL="${RENDER_REPO_URL:-https://github.com/Lsandwork/digiWhiteboard}"
BRANCH="${RENDER_BRANCH:-$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)}"
REGION="${RENDER_REGION:-oregon}"
PLAN="${RENDER_PLAN:-free}"
API="https://api.render.com/v1"

if [[ -z "${RENDER_API_KEY:-}" ]]; then
  echo "ERROR: RENDER_API_KEY is required."
  echo "Create one at https://dashboard.render.com/u/settings#api-keys"
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

if [[ -z "${ROUTE_WORKER_SIGNING_SECRET:-}" ]]; then
  echo "ERROR: ROUTE_WORKER_SIGNING_SECRET missing in $WORKER_ENV"
  exit 1
fi

auth=(-H "Authorization: Bearer ${RENDER_API_KEY}" -H "Accept: application/json" -H "Content-Type: application/json")

owner_id="${RENDER_OWNER_ID:-}"
if [[ -z "$owner_id" ]]; then
  echo "Resolving Render workspace..."
  owners_json="$(curl -fsS "${auth[@]}" "${API}/owners?limit=20")"
  owner_id="$(OWNER_JSON="$owners_json" python3 - <<'PY'
import json, os
data = json.loads(os.environ["OWNER_JSON"])
items = data if isinstance(data, list) else data.get("items") or data.get("owners") or []
owners = []
for item in items:
    o = item.get("owner", item) if isinstance(item, dict) else None
    if o and o.get("id"):
        owners.append(o)
if not owners:
    raise SystemExit("No Render workspaces found for this API key.")
print(owners[0]["id"])
PY
)"
  echo "  ownerId=$owner_id"
fi

echo "Looking for existing service: $SERVICE_NAME"
services_json="$(curl -fsS "${auth[@]}" "${API}/services?limit=50&name=${SERVICE_NAME}")"
existing_id="$(SERVICES_JSON="$services_json" SERVICE_NAME="$SERVICE_NAME" python3 - <<'PY'
import json, os
data = json.loads(os.environ["SERVICES_JSON"])
name = os.environ["SERVICE_NAME"]
items = data if isinstance(data, list) else data.get("items") or []
for item in items:
    svc = item.get("service", item) if isinstance(item, dict) else None
    if svc and svc.get("name") == name:
        print(svc["id"])
        break
PY
)"

payload="$(SERVICE_NAME="$SERVICE_NAME" OWNER_ID="$owner_id" REPO_URL="$REPO_URL" BRANCH="$BRANCH" PLAN="$PLAN" REGION="$REGION" \
  ROUTE_WORKER_SIGNING_SECRET="$ROUTE_WORKER_SIGNING_SECRET" \
  ROUTE_WORKER_CALLBACK_SECRET="${ROUTE_WORKER_CALLBACK_SECRET:-}" \
  python3 - <<'PY'
import json, os
print(json.dumps({
  "type": "web_service",
  "name": os.environ["SERVICE_NAME"],
  "ownerId": os.environ["OWNER_ID"],
  "repo": os.environ["REPO_URL"],
  "autoDeploy": "yes",
  "branch": os.environ["BRANCH"],
  "rootDir": "services/route-worker",
  "envVars": [
    {"key": "ROUTE_WORKER_SIGNING_SECRET", "value": os.environ["ROUTE_WORKER_SIGNING_SECRET"]},
    {"key": "ROUTE_WORKER_CALLBACK_SECRET", "value": os.environ.get("ROUTE_WORKER_CALLBACK_SECRET", "")},
  ],
  "serviceDetails": {
    "env": "docker",
    "plan": os.environ["PLAN"],
    "region": os.environ["REGION"],
    "healthCheckPath": "/health",
    "numInstances": 1,
    "dockerfilePath": "./Dockerfile",
    "dockerContext": ".",
  },
}))
PY
)"

if [[ -n "$existing_id" ]]; then
  echo "Updating existing service $existing_id ..."
  curl -fsS "${auth[@]}" -X PUT "${API}/services/${existing_id}/env-vars" \
    -d "$(ROUTE_WORKER_SIGNING_SECRET="$ROUTE_WORKER_SIGNING_SECRET" \
      ROUTE_WORKER_CALLBACK_SECRET="${ROUTE_WORKER_CALLBACK_SECRET:-}" \
      python3 - <<'PY'
import json, os
print(json.dumps([
  {"key": "ROUTE_WORKER_SIGNING_SECRET", "value": os.environ["ROUTE_WORKER_SIGNING_SECRET"]},
  {"key": "ROUTE_WORKER_CALLBACK_SECRET", "value": os.environ.get("ROUTE_WORKER_CALLBACK_SECRET", "")},
]))
PY
)" >/dev/null
  curl -fsS "${auth[@]}" -X POST "${API}/services/${existing_id}/deploys" \
    -d '{"clearCache":"do_not_clear"}' >/dev/null
  service_id="$existing_id"
  service_json="$(curl -fsS "${auth[@]}" "${API}/services/${service_id}")"
else
  echo "Creating Render web service..."
  create_json="$(curl -fsS "${auth[@]}" -X POST "${API}/services" -d "$payload")"
  service_json="$create_json"
  service_id="$(CREATE_JSON="$create_json" python3 - <<'PY'
import json, os
data = json.loads(os.environ["CREATE_JSON"])
svc = data.get("service", data)
print(svc["id"])
PY
)"
fi

service_url="$(SERVICE_JSON="$service_json" python3 - <<'PY'
import json, os
data = json.loads(os.environ["SERVICE_JSON"])
svc = data.get("service", data)
details = svc.get("serviceDetails") or {}
url = details.get("url") or ""
if not url:
    host = details.get("host") or svc.get("slug") or ""
    if host:
        url = host if host.startswith("http") else f"https://{host}.onrender.com" if "." not in host else f"https://{host}"
        if not host.startswith("http") and "." not in host:
            url = f"https://{host}.onrender.com"
        elif not host.startswith("http"):
            url = f"https://{host}"
print(url.rstrip("/"))
PY
)"

if [[ -z "$service_url" ]]; then
  slug="$(SERVICE_JSON="$service_json" python3 - <<'PY'
import json, os
data = json.loads(os.environ["SERVICE_JSON"])
svc = data.get("service", data)
print(svc.get("slug") or "")
PY
)"
  if [[ -n "$slug" ]]; then
    service_url="https://${slug}.onrender.com"
  fi
fi

echo "Service ID: $service_id"
echo "Service URL: $service_url"

if [[ -n "$service_url" ]]; then
  WORKER_ENV="$WORKER_ENV" SERVICE_URL="$service_url" python3 - <<'PY'
from pathlib import Path
import os
path = Path(os.environ["WORKER_ENV"])
url = os.environ["SERVICE_URL"].rstrip("/")
lines = []
found = False
for line in path.read_text().splitlines():
    if line.startswith("ROUTE_WORKER_URL="):
        lines.append(f"ROUTE_WORKER_URL={url}")
        found = True
    else:
        lines.append(line)
if not found:
    lines.append(f"ROUTE_WORKER_URL={url}")
path.write_text("\n".join(lines) + "\n")
print(f"Updated {path} ROUTE_WORKER_URL")
PY
fi

echo "Waiting for /health ..."
ok=0
for i in $(seq 1 60); do
  if curl -fsS --max-time 10 "${service_url}/health" >/tmp/route-worker-health.json 2>/dev/null; then
    cat /tmp/route-worker-health.json
    echo
    ok=1
    break
  fi
  sleep 10
  echo "  attempt $i/60 ..."
done

if [[ "$ok" -ne 1 ]]; then
  echo "WARNING: health check not ready yet. Check Render deploy logs."
  echo "Once live: export ROUTE_WORKER_URL=$service_url && ./scripts/push-route-generator-vercel-env.sh"
  exit 2
fi

echo "Health OK. Next: push URL to Vercel:"
echo "  export ROUTE_WORKER_URL=$service_url"
echo "  ./scripts/push-route-generator-vercel-env.sh"
