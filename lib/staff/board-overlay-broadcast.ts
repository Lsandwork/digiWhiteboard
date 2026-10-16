/**
 * Lightweight staff-board overlay change notification.
 *
 * After a push notice is durably persisted, the server sends ONE Supabase
 * Realtime Broadcast (HTTP) for the event. Every connected staff board
 * receives that single fan-out and performs one targeted fresh overlay
 * fetch. No database row is written, no payload larger than a change
 * token is sent, and boards keep their low-frequency poll as fallback.
 *
 * This module is server-only (service-role key) and must never throw:
 * a failed broadcast is recovered by the existing polling fallback.
 */

import {
  BOARD_OVERLAY_BROADCAST_EVENT,
  BOARD_OVERLAY_BROADCAST_TOPIC
} from "@/lib/staff/board-overlay-broadcast-shared";

export { BOARD_OVERLAY_BROADCAST_EVENT, BOARD_OVERLAY_BROADCAST_TOPIC };

const BROADCAST_TIMEOUT_MS = 800;

export type BoardOverlayBroadcastPayload = {
  kind: string;
  at: string;
};

export function buildBoardOverlayBroadcastPayload(kind: string, now = new Date()): BoardOverlayBroadcastPayload {
  return { kind: String(kind || "staff_push_notice").slice(0, 60), at: now.toISOString() };
}

export function buildBoardOverlayBroadcastRequest(
  supabaseUrl: string,
  payload: BoardOverlayBroadcastPayload
) {
  const base = supabaseUrl.replace(/\/+$/, "");
  return {
    url: `${base}/realtime/v1/api/broadcast`,
    body: {
      messages: [
        {
          topic: BOARD_OVERLAY_BROADCAST_TOPIC,
          event: BOARD_OVERLAY_BROADCAST_EVENT,
          payload,
          private: false
        }
      ]
    }
  };
}

/**
 * Publish one overlay-change broadcast. Returns whether Realtime accepted
 * it; callers must not report this as the notice-save result — persistence
 * is the source of truth, and polling recovers missed broadcasts.
 */
export async function publishBoardOverlayChange(kind: string): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceRoleKey) return false;

  const { url, body } = buildBoardOverlayBroadcastRequest(
    supabaseUrl,
    buildBoardOverlayBroadcastPayload(kind)
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BROADCAST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!response.ok) {
      console.warn("[board-overlay-broadcast] realtime rejected broadcast", { status: response.status });
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[board-overlay-broadcast] publish failed; polling fallback will recover", {
      error: error instanceof Error ? error.message : "unknown"
    });
    return false;
  } finally {
    clearTimeout(timer);
  }
}
