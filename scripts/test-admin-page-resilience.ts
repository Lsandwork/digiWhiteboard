import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SERVICE_SUPABASE_CRON_TIMEOUT_MS, SERVICE_SUPABASE_TIMEOUT_MS } from "../lib/supabase/server";
import { readResponseJson } from "../lib/http/read-response-json";
import { LIVE_DATA_UNAVAILABLE_MESSAGE, LIVE_DATA_SLOW_MESSAGE, isTimeoutLikeError, humanizeUnknownError } from "../lib/safe-url";
import {
  COMMISSIONS_IMPORT_CLIENT_TIMEOUT_MS,
  COMMISSIONS_MUTATION_TIMEOUT_MS
} from "../lib/staff/commission-ledger/import-timeouts";
import { skipDashboardBackgroundHydrate, skipHeavyBoardWidgets, skipHungBoardSnapshots, skipSettingsAndAccess } from "../lib/admin/dashboard-load";
import { OVERVIEW_QUERY_TIMEOUT_MS, OVERVIEW_SETTINGS_POINTERS, emptyOverviewPayload } from "../lib/admin/overview";
import { capStaffOpsListPayload, STAFF_OPS_LIST_MESSAGE_LIMIT } from "../lib/staff/admin-ops";

assert.equal(skipSettingsAndAccess(null), false);
assert.equal(skipSettingsAndAccess("package_commissions"), true);
assert.equal(skipSettingsAndAccess("my_shift"), true);
assert.equal(skipSettingsAndAccess("crossover_communication"), true);
assert.equal(skipSettingsAndAccess("overview"), false);
assert.equal(skipSettingsAndAccess("settings"), false);
assert.equal(skipHeavyBoardWidgets("staff", null), false);
assert.equal(skipHeavyBoardWidgets("staff", "package_commissions"), true);
assert.equal(skipHeavyBoardWidgets("staff", "overview"), true);
assert.equal(skipHeavyBoardWidgets("staff", "integrations"), false);
assert.equal(skipHeavyBoardWidgets("lobby", "content"), false);
assert.equal(skipHeavyBoardWidgets("marketing", "cast_tv"), true);
assert.equal(skipHeavyBoardWidgets("marketing", "settings"), false);
assert.equal(skipHungBoardSnapshots("staff", "overview"), true);
assert.equal(skipHungBoardSnapshots("staff", null), true);
assert.equal(skipHungBoardSnapshots("staff", "integrations"), false);
assert.equal(skipHungBoardSnapshots("lobby", "content"), false);
assert.equal(skipDashboardBackgroundHydrate("staff", "overview"), true);
assert.equal(skipDashboardBackgroundHydrate("staff", "ops_system_health"), true);
assert.equal(skipDashboardBackgroundHydrate("staff", "package_commissions"), true);
assert.equal(skipDashboardBackgroundHydrate("staff", "my_shift"), false);
assert.equal(skipDashboardBackgroundHydrate("staff", "integrations"), false);
assert.equal(skipDashboardBackgroundHydrate("marketing", "cast_tv"), true);
assert.equal(OVERVIEW_QUERY_TIMEOUT_MS, 4_000);
assert.equal(emptyOverviewPayload().degraded, true);
assert.equal(emptyOverviewPayload().metrics.length, 6);
assert.ok(OVERVIEW_SETTINGS_POINTERS.some((pointer) => pointer.path === "staff_admin_ops->active_issues"));
assert.ok(OVERVIEW_SETTINGS_POINTERS.every((pointer) => !pointer.path.includes("crossover_messages")));
assert.equal(STAFF_OPS_LIST_MESSAGE_LIMIT, 120);
assert.equal(
  capStaffOpsListPayload({
    crossover_messages: Array.from({ length: 200 }, (_, i) => ({
      id: `m${i}`,
      created_at: "2026-01-01T00:00:00.000Z"
    })),
    crossover_message_replies: [
      { id: "r1", crossover_message_id: "m0", created_at: "2026-01-01T00:00:00.000Z" },
      { id: "r2", crossover_message_id: "m199", created_at: "2026-01-01T00:00:00.000Z" }
    ],
    owner_follow_ups: [],
    active_issues: [],
    activity_logs: [],
    staff_directory: [],
    notifications: []
  } as never).crossover_messages.length,
  120
);

assert.equal(SERVICE_SUPABASE_TIMEOUT_MS, 8_000);
assert.equal(SERVICE_SUPABASE_CRON_TIMEOUT_MS, 20_000);
assert.ok(SERVICE_SUPABASE_CRON_TIMEOUT_MS > SERVICE_SUPABASE_TIMEOUT_MS);
assert.equal(COMMISSIONS_MUTATION_TIMEOUT_MS, 25_000);
assert.equal(COMMISSIONS_IMPORT_CLIENT_TIMEOUT_MS, 28_000);
assert.ok(COMMISSIONS_IMPORT_CLIENT_TIMEOUT_MS > COMMISSIONS_MUTATION_TIMEOUT_MS);
assert.equal(isTimeoutLikeError({ name: "AbortError", message: "The operation was aborted." }), true);
assert.equal(
  humanizeUnknownError(new Error("The operation was aborted."), "fallback"),
  LIVE_DATA_SLOW_MESSAGE
);

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
assert.match(commissionsRoute, /COMMISSIONS_MUTATION_TIMEOUT_MS/);
assert.match(commissionsRoute, /COMMISSIONS_IMPORT_SLOW_MESSAGE/);
assert.match(commissionsRoute, /timeoutMs: COMMISSIONS_MUTATION_TIMEOUT_MS/);
assert.match(commissionsRoute, /timeoutMs: COMMISSIONS_OPTIONAL_TIMEOUT_MS/);
assert.match(commissionsRoute, /insertCommissionCsvToLedger|importCommissionCsvToLedger/);
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
assert.match(panel, /COMMISSIONS_IMPORT_CLIENT_TIMEOUT_MS/);
assert.match(panel, /timeoutMessage: COMMISSIONS_IMPORT_SLOW_MESSAGE/);
assert.match(panel, /void load\(\{ quiet: true \}\)/);
assert.match(panel, /if \(!options\?\.quiet\)/);
assert.doesNotMatch(panel, /await load\(\{ quiet: true \}\)/);

const postgresLedger = readFileSync("lib/staff/commission-ledger/list-via-postgres.ts", "utf8");
assert.match(postgresLedger, /withCommissionPostgres/);
assert.match(postgresLedger, /package_commission_records/);
assert.match(postgresLedger, /6543/);
assert.match(postgresLedger, /rejectUnauthorized: false/);
// The connection string itself must carry no sslmode (see test:commission-ledger).
assert.doesNotMatch(postgresLedger, /\$\{database\}\?/);
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
assert.match(toast, /looksTechnical/);

const fetchAdminJsonSrc = readFileSync("lib/http/fetch-admin-json.ts", "utf8");
assert.match(fetchAdminJsonSrc, /timeoutMessage/);
assert.match(fetchAdminJsonSrc, /isTimeoutLikeError/);

const ssrAccess = readFileSync("lib/admin/resolve-user-access.ts", "utf8");
assert.match(ssrAccess, /accessFromLegacyRole/);
assert.match(ssrAccess, /SERVICE_SUPABASE_TIMEOUT_MS/);

const boardFetch = readFileSync("lib/board-fetch.ts", "utf8");
assert.match(boardFetch, /readResponseJson/);
assert.doesNotMatch(boardFetch, /response\.json\(\)/);

const cronFitdog = readFileSync("app/api/cron/fitdog-sync/route.ts", "utf8");
assert.match(cronFitdog, /SERVICE_SUPABASE_CRON_TIMEOUT_MS/);

const dashboardSource = readFileSync("components/admin/AdminDashboard.tsx", "utf8");
assert.match(dashboardSource, /bootstrapDashboardPayload/);
assert.match(dashboardSource, /sessionBootstrap/);
assert.match(dashboardSource, /\/api\/admin\/session/);
assert.match(dashboardSource, /TabErrorBoundary/);
assert.match(dashboardSource, /useSavedAgoLabel/);
assert.match(dashboardSource, /tab=\$\{encodeURIComponent\(tabRef\.current\)\}/);
assert.match(dashboardSource, /\/api\/admin\/dashboard\?board=\$\{encodeURIComponent\(board\)\}`/);
assert.match(dashboardSource, /skipSettingsAndAccess/);
assert.match(dashboardSource, /hydrateAbortRef/);
assert.match(dashboardSource, /skipDashboardBackgroundHydrate/);
assert.doesNotMatch(dashboardSource, /setInterval\(\(\) => setCurrentTimeMs/);
assert.match(dashboardSource, /if \(!savedAt\) return/);

const dashboardLoad = readFileSync("lib/admin/dashboard-load.ts", "utf8");
assert.match(dashboardLoad, /export function skipSettingsAndAccess/);
assert.match(dashboardLoad, /if \(!tab\) return false/);
assert.match(dashboardLoad, /export function skipHeavyBoardWidgets/);
assert.match(dashboardLoad, /export function skipHungBoardSnapshots/);
assert.match(dashboardLoad, /export function skipDashboardBackgroundHydrate/);

const overviewSource = readFileSync("lib/admin/overview.ts", "utf8");
assert.match(overviewSource, /OVERVIEW_QUERY_TIMEOUT_MS = 4_000/);
assert.match(overviewSource, /loadAdminSettingsJsonPointers/);
assert.match(overviewSource, /staff_admin_ops->active_issues/);
assert.match(overviewSource, /storage\/v1\/object\/public/);
assert.match(overviewSource, /emptyOverviewPayload/);
assert.doesNotMatch(overviewSource, /listAllManagementReports/);
assert.doesNotMatch(overviewSource, /listStaffOps/);
assert.doesNotMatch(overviewSource, /loadCastTvHeartbeat/);
assert.doesNotMatch(overviewSource, /select\("\*"\)/);

const overviewRoute = readFileSync("app/api/admin/overview/route.ts", "utf8");
assert.match(overviewRoute, /maxDuration = 20/);
assert.match(overviewRoute, /timeoutMs: OVERVIEW_QUERY_TIMEOUT_MS/);
assert.match(overviewRoute, /emptyOverviewPayload/);
assert.doesNotMatch(overviewRoute, /maxDuration = 60/);

const overviewPanel = readFileSync("components/admin/OverviewPanel.tsx", "utf8");
assert.match(overviewPanel, /AbortController/);
assert.match(overviewPanel, /10_000/);
assert.match(overviewPanel, /data\.degraded/);

const sessionSource = readFileSync("app/api/admin/session/route.ts", "utf8");
assert.match(sessionSource, /SESSION_ENRICH_BUDGET_MS = 800/);
assert.match(sessionSource, /cookiePayload/);
assert.match(sessionSource, /Promise\.race/);

const dashboardRoute = readFileSync("app/api/admin/dashboard/route.ts", "utf8");
assert.match(dashboardRoute, /skipSettingsAndAccess/);
assert.match(dashboardRoute, /skipAccessWork/);
assert.match(dashboardRoute, /skipHungBoardSnapshots/);
assert.match(dashboardRoute, /isHungTableInCooldown/);
assert.doesNotMatch(dashboardRoute, /live_transition_dogs"\)\s*\.select\("\*"\)/);
assert.doesNotMatch(dashboardRoute, /gingr_webhook_events"\)\s*\.select\("\*"\)/);

const userAccess = readFileSync("lib/admin/user-access.ts", "utf8");
assert.match(userAccess, /Promise\.all\(/);
assert.match(userAccess, /LEGACY_ACCESS_MIGRATE_TTL_MS/);
assert.match(userAccess, /Claim the slot before the query/);
assert.match(userAccess, /export async function getUserAccessMap/);

const usersRoute = readFileSync("app/api/admin/users/route.ts", "utf8");
assert.match(usersRoute, /getUserAccessMap/);
assert.doesNotMatch(usersRoute, /users\.map\(async \(user\) =>/);

const staffOps = readFileSync("lib/staff/admin-ops.ts", "utf8");
assert.match(staffOps, /STAFF_OPS_LIST_MESSAGE_LIMIT = 120/);
assert.match(staffOps, /export function capStaffOpsListPayload/);

const staffOpsRoute = readFileSync("app/api/admin/staff-operations/route.ts", "utf8");
assert.match(staffOpsRoute, /STAFF_OPS_LOAD_TIMEOUT_MS = 8_000/);
assert.match(staffOpsRoute, /capStaffOpsListPayload/);

const mediaLibrary = readFileSync("lib/media-library/service.ts", "utf8");
assert.doesNotMatch(mediaLibrary, /count: "exact"/);
assert.match(mediaLibrary, /from \+ pageSize/);

const commissionsPanel = readFileSync("components/admin/PackageCommissionsPanel.tsx", "utf8");
assert.match(commissionsPanel, /retry/);

const liveFleetCron = readFileSync("app/api/cron/live-fleet-sync/route.ts", "utf8");
assert.match(liveFleetCron, /SCHEMA_RECHECK_MS/);
assert.match(liveFleetCron, /ensureLiveFleetSchemaCached/);

const tlCron = readFileSync("app/api/cron/tl-digi-board-sync/route.ts", "utf8");
assert.match(tlCron, /SCHEMA_RECHECK_MS/);
assert.match(tlCron, /maxDuration = 25/);

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
