import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  HUNG_TABLE_ABORT_MS,
  HUNG_TABLE_QUERY_COOLDOWN_MS,
  HUNG_TABLES,
  __resetHungTableCooldownsForTests,
  anyHungTableInCooldown,
  isHungQueryError,
  isHungTableInCooldown,
  isLiveTransitionQueryInCooldown,
  markHungTableTimeout,
  markLiveTransitionQueryTimeout,
  skipOrQueryHungTable
} from "../lib/hung-table-guard";

__resetHungTableCooldownsForTests();

assert.equal(HUNG_TABLE_ABORT_MS, 1_200);
assert.equal(HUNG_TABLE_QUERY_COOLDOWN_MS, 8_000);
assert.equal(HUNG_TABLES.liveTransitionDogs, "live_transition_dogs");
assert.equal(HUNG_TABLES.gingrWebhookEvents, "gingr_webhook_events");
assert.equal(HUNG_TABLES.adminSettings, "admin_settings");

assert.equal(isHungQueryError({ name: "AbortError", message: "The operation was aborted" }), true);
assert.equal(isHungQueryError(new Error("fast-checkout live_transition_dogs timed out after 1500ms.")), true);
assert.equal(isHungQueryError(new Error("relation does not exist")), false);

{
  const now = 1_000_000;
  assert.equal(isHungTableInCooldown(HUNG_TABLES.liveTransitionDogs, now), false);
  markHungTableTimeout(HUNG_TABLES.liveTransitionDogs, now);
  assert.equal(isHungTableInCooldown(HUNG_TABLES.liveTransitionDogs, now + 100), true);
  assert.equal(isLiveTransitionQueryInCooldown(now + 100), true);
  assert.equal(isHungTableInCooldown(HUNG_TABLES.gingrWebhookEvents, now + 100), false);
  assert.equal(anyHungTableInCooldown(now + 100), true);
  assert.equal(isHungTableInCooldown(HUNG_TABLES.liveTransitionDogs, now + HUNG_TABLE_QUERY_COOLDOWN_MS), false);
}

__resetHungTableCooldownsForTests();

async function testSkipOrQuery() {
  let calls = 0;
  const skipped = await skipOrQueryHungTable(
    HUNG_TABLES.adminSettings,
    async () => {
      calls += 1;
      throw Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
    },
    { data: null }
  );
  assert.equal(skipped.timedOut, true);
  assert.equal(skipped.skipped, false);
  assert.equal(calls, 1);
  assert.equal(isHungTableInCooldown(HUNG_TABLES.adminSettings), true);

  const cooled = await skipOrQueryHungTable(
    HUNG_TABLES.adminSettings,
    async () => {
      calls += 1;
      return { data: "should-not-run" };
    },
    { data: null }
  );
  assert.equal(cooled.skipped, true);
  assert.equal(calls, 1);
}

void testSkipOrQuery()
  .then(() => {
    __resetHungTableCooldownsForTests();
    markLiveTransitionQueryTimeout();
    assert.equal(isLiveTransitionQueryInCooldown(), true);

    const health = readFileSync("lib/system-health/health-checks.ts", "utf8");
    assert.match(health, /getHungTableSupabase/);
    assert.match(health, /queryHungRow/);
    assert.match(health, /anyHungTableInCooldown/);
    assert.doesNotMatch(health, /safeHungTable/);
    assert.doesNotMatch(health, /Promise\.race\(\[/);

    const realtime = readFileSync("lib/system-health/probes/realtime.ts", "utf8");
    assert.match(realtime, /board_freshest_skipped/);
    assert.match(realtime, /getHungTableSupabase/);
    assert.doesNotMatch(realtime, /Promise\.all\(\[\s*supabase\s*\.from\("live_transition_dogs"\)/);

    const dashboard = readFileSync("lib/system-health/dashboard.ts", "utf8");
    assert.match(dashboard, /emptySystemHealthViewPayload/);
    assert.match(dashboard, /isHungQueryError/);
    assert.match(dashboard, /timeoutMs: SYSTEM_HEALTH_SECTION_TIMEOUT_MS/);

    const route = readFileSync("app/api/admin/system-health/route.ts", "utf8");
    assert.match(route, /emptySystemHealthViewPayload\(view/);
    assert.doesNotMatch(route, /status: 500 \}/);

    const statusRoute = readFileSync("app/api/admin/status/route.ts", "utf8");
    assert.match(statusRoute, /VISIBLE_TRANSITION_SELECT/);
    assert.doesNotMatch(statusRoute, /select\("\*"\)/);

    const liveBoard = readFileSync("app/api/live-board/route.ts", "utf8");
    assert.match(liveBoard, /isLiveTransitionQueryInCooldown/);
    assert.match(liveBoard, /VISIBLE_TRANSITION_SELECT/);
    assert.doesNotMatch(liveBoard, /select\("\*"\)/);

    const snapshot = readFileSync("lib/ops-command-center/snapshot.ts", "utf8");
    assert.match(snapshot, /getHungTableSupabase/);
    assert.match(snapshot, /HUNG_TABLES\.liveTransitionDogs/);

    const opsHealth = readFileSync("lib/ops-command-center/system-health.ts", "utf8");
    assert.match(opsHealth, /probeTimedOut/);
    assert.match(opsHealth, /getHungTableSupabase/);

    const settingsStore = readFileSync("lib/admin/settings-json-store.ts", "utf8");
    assert.match(settingsStore, /isHungTableInCooldown\(HUNG_TABLES\.adminSettings\)/);

    const ui = readFileSync("components/admin/system-health/SystemHealthDebuggingApp.tsx", "utf8");
    assert.match(ui, /fetchAdminJson/);
    assert.match(ui, /healthJson/);

    console.log("test-hung-table-guard: ok");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
