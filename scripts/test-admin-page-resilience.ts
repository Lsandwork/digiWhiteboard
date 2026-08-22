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
assert.match(records, /q = q\.gte\(dateField, dateFrom\)/);
assert.doesNotMatch(records, /fallbackField/);
assert.doesNotMatch(records, /ensureCommissionLedgerHotPath/);
assert.doesNotMatch(records, /ensureCommissionLedgerBackfill\(supabase\)/);
assert.doesNotMatch(records, /ensureIvonneRejectedDuplicatesPurged/);
assert.doesNotMatch(records, /count: "exact"/);

const commissionsRoute = readFileSync("app/api/admin/package-commissions/route.ts", "utf8");
assert.match(commissionsRoute, /accessFromLegacyRole/);
assert.match(commissionsRoute, /COMMISSIONS_QUERY_TIMEOUT_MS = 5_000/);
assert.match(commissionsRoute, /listCommissionRecordsViaPostgres/);
assert.match(commissionsRoute, /listCommissionRecordsViaRest/);
assert.match(commissionsRoute, /capLedgerFilters/);
assert.match(commissionsRoute, /delayedReason/);
assert.match(commissionsRoute, /listCommissionTrainersFromDb/);
assert.match(commissionsRoute, /liveMatrix/);
assert.match(commissionsRoute, /humanizeUnknownError/);
assert.doesNotMatch(commissionsRoute, /listAdminUsers/);
assert.doesNotMatch(commissionsRoute, /getServiceSupabase\(\)/);
assert.doesNotMatch(commissionsRoute, /Promise\.any/);
assert.doesNotMatch(commissionsRoute, /\.catch\(\(\) => \(\{ delayed: true/);

const panel = readFileSync("components/admin/PackageCommissionsPanel.tsx", "utf8");
assert.match(panel, /fetchAdminJson/);
assert.match(panel, /loadError/);
assert.match(panel, /delayedReason/);
assert.match(panel, /fast", "1"/);
assert.doesNotMatch(panel, /await response\.json\(\)/);
assert.match(panel, /timeoutMs: 10_000/);

const postgresLedger = readFileSync("lib/staff/commission-ledger/list-via-postgres.ts", "utf8");
assert.match(postgresLedger, /statement_timeout/);
assert.match(postgresLedger, /package_commission_records/);
assert.match(postgresLedger, /6543/);
assert.doesNotMatch(postgresLedger, /service_date >=/);

const restLedger = readFileSync("lib/staff/commission-ledger/list-via-rest.ts", "utf8");
assert.match(restLedger, /count=none/);
assert.match(restLedger, /package_commission_records/);

const diagnostics = readFileSync("lib/staff/commission-ledger/diagnostics.ts", "utf8");
assert.match(diagnostics, /legacy_settings_rows/);
assert.match(diagnostics, /direct_postgres/);
assert.match(diagnostics, /rest_exact_count/);
// Serial probes stacked past maxDuration and 504'd the report.
assert.match(diagnostics, /Promise\.all\(\[/);
assert.match(diagnostics, /PROBE_TIMEOUT_MS/);
assert.match(commissionsRoute, /maxDuration = 30/);
// Diagnostics must report configuration presence, never secret values.
assert.doesNotMatch(diagnostics, /process\.env\.SUPABASE_SERVICE_ROLE_KEY\s*\}/);
assert.match(commissionsRoute, /view === "diagnostics"/);
assert.match(commissionsRoute, /Super Admin only/);

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
