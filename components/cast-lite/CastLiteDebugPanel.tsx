"use client";

import type { CastHealthStatus } from "@/hooks/useWhiteboardCastState";

export function CastLiteDebugPanel({
  health,
  showReconnecting,
  activeAlert,
  alertId,
  alertType,
  stateVersion
}: {
  health: CastHealthStatus;
  showReconnecting: boolean;
  activeAlert?: boolean;
  alertId?: string | null;
  alertType?: string | null;
  stateVersion?: string | null;
}) {
  return (
    <aside className="cast-lite-debug" aria-label="Cast health monitor">
      <p>version: {health.version ?? "—"}</p>
      <p>last update: {health.lastSuccessAt ?? "—"}</p>
      <p>reconnects: {health.reconnectCount}</p>
      <p>polling: {health.polling ? "on" : "off"}</p>
      {activeAlert !== undefined ? <p>activeAlert: {activeAlert ? "true" : "false"}</p> : null}
      {alertId !== undefined ? <p>alert id: {alertId ?? "—"}</p> : null}
      {alertType !== undefined ? <p>alert type: {alertType ?? "—"}</p> : null}
      {stateVersion !== undefined ? <p>state version: {stateVersion ?? "—"}</p> : null}
      {health.lastError ? <p>error: {health.lastError}</p> : null}
      {showReconnecting ? <p>status: reconnecting</p> : <p>status: online</p>}
    </aside>
  );
}
