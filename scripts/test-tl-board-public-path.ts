import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assembleTlDigiBoardPublicPayload } from "../lib/tl-digi-board/server";
import { DEFAULT_TL_DIGI_BOARD_CONFIG } from "../lib/tl-digi-board/config";
import { dateAtLaLocal } from "../lib/tl-digi-board/medication-windows";

{
  const source = readFileSync("lib/tl-digi-board/server.ts", "utf8");
  assert.match(source, /withTimeoutFallback\(\s*loadTlDigiBoardSnapshot\(client\)\.catch\(\(\) => null\),\s*TL_BOARD_PUBLIC_LOAD_TIMEOUT_MS/);
}

// Public TV payload assembly must never require a live Gingr sync.
{
  const now = dateAtLaLocal({ year: 2026, month: 8, day: 19, hour: 12, minute: 11, second: 0 });
  const { payload, needsBackgroundSync } = assembleTlDigiBoardPublicPayload({
    config: DEFAULT_TL_DIGI_BOARD_CONFIG,
    snapshot: null,
    reminders: [],
    now
  });

  assert.equal(needsBackgroundSync, true);
  assert.equal(payload.meta.currentPeriod, "mid_day");
  assert.equal(payload.meta.medicationsAllClear, false);
  assert.equal(payload.meta.boardState, "CONNECTION_ERROR");
  assert.ok(payload.generatedAt);
}

console.log("test-tl-board-public-path: ok");
