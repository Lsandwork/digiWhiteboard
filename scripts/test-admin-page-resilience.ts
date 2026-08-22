import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SERVICE_SUPABASE_CRON_TIMEOUT_MS, SERVICE_SUPABASE_TIMEOUT_MS } from "../lib/supabase/server";
import { readResponseJson } from "../lib/http/read-response-json";
import { LIVE_DATA_UNAVAILABLE_MESSAGE } from "../lib/safe-url";

assert.equal(SERVICE_SUPABASE_TIMEOUT_MS, 8_000);
assert.equal(SERVICE_SUPABASE_CRON_TIMEOUT_MS, 60_000);

const server = readFileSync("lib/supabase/server.ts", "utf8");
assert.match(server, /SERVICE_SUPABASE_TIMEOUT_MS/);
assert.match(server, /options\.timeoutMs === 0/);

const records = readFileSync("lib/staff/commission-ledger/records.ts", "utf8");
assert.match(records, /LEDGER_LIST_COLUMNS/);
assert.doesNotMatch(records, /ensureCommissionLedgerHotPath/);
assert.doesNotMatch(records, /ensureCommissionLedgerBackfill\(supabase\)/);
assert.doesNotMatch(records, /ensureIvonneRejectedDuplicatesPurged/);
assert.doesNotMatch(records, /count: "exact"/);

const commissionsRoute = readFileSync("app/api/admin/package-commissions/route.ts", "utf8");
assert.match(commissionsRoute, /accessFromLegacyRole/);
assert.match(commissionsRoute, /COMMISSIONS_QUERY_TIMEOUT_MS/);
assert.match(commissionsRoute, /listCommissionTrainersFromDb/);
assert.match(commissionsRoute, /liveMatrix/);
assert.match(commissionsRoute, /humanizeUnknownError/);
assert.doesNotMatch(commissionsRoute, /listAdminUsers/);
assert.doesNotMatch(commissionsRoute, /getServiceSupabase\(\)/);

const panel = readFileSync("components/admin/PackageCommissionsPanel.tsx", "utf8");
assert.match(panel, /fetchAdminJson/);
assert.match(panel, /loadError/);
assert.doesNotMatch(panel, /await response\.json\(\)/);
assert.match(panel, /timeoutMs: 8_000/);

const toast = readFileSync("components/admin/ui/ToastProvider.tsx", "utf8");
assert.match(toast, /humanizeUnknownError/);

const ssrAccess = readFileSync("lib/admin/resolve-user-access.ts", "utf8");
assert.match(ssrAccess, /accessFromLegacyRole/);
assert.match(ssrAccess, /SERVICE_SUPABASE_TIMEOUT_MS/);

const boardFetch = readFileSync("lib/board-fetch.ts", "utf8");
assert.match(boardFetch, /readResponseJson/);
assert.doesNotMatch(boardFetch, /response\.json\(\)/);

const cronFitdog = readFileSync("app/api/cron/fitdog-sync/route.ts", "utf8");
assert.match(cronFitdog, /SERVICE_SUPABASE_CRON_TIMEOUT_MS/);

async function testHtmlGuard() {
  const html = new Response("<!DOCTYPE html><html><title>Error</title>Error code 522</html>", {
    headers: { "content-type": "text/html" }
  });
  await assert.rejects(() => readResponseJson(html), (error: unknown) => {
    assert.equal(error instanceof Error && error.message, LIVE_DATA_UNAVAILABLE_MESSAGE);
    return true;
  });
}

void testHtmlGuard()
  .then(() => {
    console.log("admin page resilience tests passed");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
