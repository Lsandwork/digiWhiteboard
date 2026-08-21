import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isDocumentVisible, startVisibilityAwareInterval } from "../lib/visibility-poll";
import { isTvWhiteboardPath } from "../lib/tv-hard-refresh";
import { FAST_CHECKOUT_QUERY_TIMEOUT_MS } from "../lib/board-fast-checkout";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

{
  const roleWorkspaces = source("components/admin/ops-command-center/RoleWorkspaces.tsx");
  assert.match(roleWorkspaces, /\/api\/board\/checkouts/);
  assert.doesNotMatch(roleWorkspaces, /\/api\/board\/live/);
}

{
  const checkouts = source("app/api/board/checkouts/route.ts");
  assert.match(checkouts, /timeoutMs:\s*FAST_CHECKOUT_QUERY_TIMEOUT_MS/);
  assert.equal(FAST_CHECKOUT_QUERY_TIMEOUT_MS, 1500);
}

{
  const board = source("components/BoardClient.tsx");
  assert.match(board, /startVisibilityAwareInterval/);
  const lobby = source("components/lobby/LobbyCheckoutBoard.tsx");
  assert.match(lobby, /startVisibilityAwareInterval/);
}

{
  assert.equal(existsSync(join(process.cwd(), "app/boards/error.tsx")), true);
  assert.equal(existsSync(join(process.cwd(), "app/cast-tv/error.tsx")), true);
  assert.equal(existsSync(join(process.cwd(), "app/staff-cast/error.tsx")), true);
  assert.equal(existsSync(join(process.cwd(), "app/lobby-cast/error.tsx")), true);
  const appError = source("app/error.tsx");
  assert.match(appError, /isTvWhiteboardPath/);
}

{
  assert.equal(isTvWhiteboardPath("/boards/tl-alerts-reminders"), true);
  assert.equal(isTvWhiteboardPath("/cast-tv"), true);
  assert.equal(isTvWhiteboardPath("/admin"), false);
  assert.equal(isTvWhiteboardPath("/admin/login"), false);
}

{
  assert.equal(isDocumentVisible(), true);
  let ticks = 0;
  const stop = startVisibilityAwareInterval(() => {
    ticks += 1;
  }, 10_000);
  stop();
  assert.equal(ticks, 0);
}

console.log("test-platform-reliability: ok");
