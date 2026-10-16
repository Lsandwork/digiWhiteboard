import assert from "node:assert/strict";

// The broadcast publisher reads env at call time; set a fake project first.
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

async function main() {
const {
  BOARD_OVERLAY_BROADCAST_EVENT,
  BOARD_OVERLAY_BROADCAST_TOPIC,
  buildBoardOverlayBroadcastPayload,
  buildBoardOverlayBroadcastRequest,
  publishBoardOverlayChange
} = await import("../lib/staff/board-overlay-broadcast");
const { invalidateBoardOverlayCaches } = await import("../lib/board-settings-cache");
const { getTtlCache, setTtlCache } = await import("../lib/server-ttl-cache");
const { BOARD_REALTIME_CONFIRM_MS, LOBBY_REALTIME_DEBOUNCE_MS } = await import(
  "../lib/board-checkout-merge"
);

// 1. The broadcast is a tiny change token — never a settings document.
{
  const payload = buildBoardOverlayBroadcastPayload("staff_push_notice", new Date("2026-10-16T00:00:00.000Z"));
  assert.deepEqual(payload, { kind: "staff_push_notice", at: "2026-10-16T00:00:00.000Z" });
  assert.ok(JSON.stringify(payload).length < 120, "payload stays a small version/change token");

  const request = buildBoardOverlayBroadcastRequest("https://example.supabase.co/", payload);
  assert.equal(request.url, "https://example.supabase.co/realtime/v1/api/broadcast");
  assert.equal(request.body.messages.length, 1);
  assert.equal(request.body.messages[0]?.topic, BOARD_OVERLAY_BROADCAST_TOPIC);
  assert.equal(request.body.messages[0]?.event, BOARD_OVERLAY_BROADCAST_EVENT);
  assert.equal(request.body.messages[0]?.private, false);
  console.log("ok - broadcast carries only a minimal change token");
}

// 2. One publish per saved change; failure is reported as false, never thrown
//    (persistence is the success criterion; polling recovers a missed event).
{
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(null, { status: 202 });
  }) as typeof fetch;
  assert.equal(await publishBoardOverlayChange("staff_push_notice"), true);
  assert.equal(calls, 1, "exactly one fan-out request per saved change");

  globalThis.fetch = (async () => new Response(null, { status: 500 })) as typeof fetch;
  assert.equal(await publishBoardOverlayChange("staff_push_notice"), false);

  globalThis.fetch = (async () => {
    throw new Error("network down");
  }) as typeof fetch;
  assert.equal(await publishBoardOverlayChange("staff_push_notice"), false);
  globalThis.fetch = originalFetch;
  console.log("ok - broadcast publish is single-shot, bounded, and non-throwing");
}

// 3. Missing configuration disables broadcast cleanly (local/dev safety).
{
  const originalFetch = globalThis.fetch;
  const savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(null, { status: 202 });
  }) as typeof fetch;
  assert.equal(await publishBoardOverlayChange("staff_push_notice"), false);
  assert.equal(calls, 0);
  process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey;
  globalThis.fetch = originalFetch;
  console.log("ok - broadcast no-ops without server configuration");
}

// 4. Fresh overlay fetches drop this instance's overlay + settings-key caches
//    (cross-instance coherence comes from fresh-on-event, not from hoping a
//    sibling instance cleared its own Map), while unrelated board caches stay.
{
  setTtlCache("board-overlays:staff_whiteboard", { stale: true }, 15_000);
  setTtlCache("admin-settings:key:staff_push_notices", { stale: true }, 30_000);
  setTtlCache("board-checkouts:fast", { dogs: 1 }, 2_500);
  invalidateBoardOverlayCaches();
  assert.equal(getTtlCache("board-overlays:staff_whiteboard"), null);
  assert.equal(getTtlCache("admin-settings:key:staff_push_notices"), null);
  assert.notEqual(getTtlCache("board-checkouts:fast"), null, "checkout caches untouched by overlay freshness");
  console.log("ok - fresh overlay invalidation is targeted and instance-local by design");
}

// 5. Lobby event-first refresh aligns with the staff confirm window and is
//    strictly faster than the previous 400ms debounce; fallback polls are
//    unchanged constants (asserted in the delivery notes, not shortened here).
{
  assert.equal(LOBBY_REALTIME_DEBOUNCE_MS, BOARD_REALTIME_CONFIRM_MS);
  assert.ok(LOBBY_REALTIME_DEBOUNCE_MS < 400);
  console.log("ok - lobby realtime debounce tightened without touching poll intervals");
}

console.log("test-whiteboard-realtime-delivery: all assertions passed");
}

void main();
