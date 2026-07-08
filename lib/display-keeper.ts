import { getPublicBuildId } from "@/lib/build-id";
import type { DisplaySyncState } from "@/lib/display-sync";

export type DisplayType = "staff_whiteboard" | "lobby_whiteboard";

export type DisplayCommandType =
  | "hard_refresh"
  | "clear_notice"
  | "show_notice"
  | "show_video"
  | "switch_display";

export type DisplayDeviceStatus = "online" | "offline" | "reconnecting";

export type DisplayCommand = {
  id: string;
  display_type: DisplayType;
  device_id: string | null;
  command_type: DisplayCommandType;
  payload: Record<string, unknown>;
  status: string;
  created_at: string;
  completed_at: string | null;
};

export type DisplayDevice = {
  id: string;
  name: string | null;
  display_type: DisplayType;
  status: string;
  last_seen_at: string;
  current_route: string | null;
  app_version: string | null;
  wake_lock_status: string | null;
  last_heartbeat_at: string | null;
  last_data_at: string | null;
  created_at: string;
  updated_at: string;
};

export const CAST_KEEPER_DEVICE_STORAGE_KEY = "fitdog_display_device_id";
export const CAST_KEEPER_HEARTBEAT_MS = 15_000;
export const CAST_KEEPER_RECONNECT_HEARTBEAT_MS = 4_000;
export const CAST_KEEPER_STALE_MS = 8 * 60_000;
export const CAST_KEEPER_RELOAD_COOLDOWN_MS = 2 * 60_000;
export const CAST_KEEPER_OFFLINE_DEVICE_MS = 90_000;

export type HeartbeatRequest = {
  deviceId: string;
  displayType: DisplayType;
  route: string;
  status?: DisplayDeviceStatus;
  wakeLockStatus?: string | null;
  lastDataAt?: string | null;
  name?: string | null;
};

export type HeartbeatResponse = {
  ok: boolean;
  serverTime: string;
  sync: DisplaySyncState;
  commands: DisplayCommand[];
  appVersion: string;
};

export function getOrCreateDisplayDeviceId() {
  if (typeof window === "undefined") return "server";

  const memoryFallback = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `display-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  try {
    const existing = window.localStorage.getItem(CAST_KEEPER_DEVICE_STORAGE_KEY)?.trim();
    if (existing) return existing;
    const next = memoryFallback();
    window.localStorage.setItem(CAST_KEEPER_DEVICE_STORAGE_KEY, next);
    return next;
  } catch {
    return memoryFallback();
  }
}

export function buildCastDisplayPath(displayType: DisplayType) {
  return displayType === "staff_whiteboard" ? "/display/staff-whiteboard" : "/display/lobby-whiteboard";
}

export function buildCastDisplayUrl(displayType: DisplayType, origin?: string) {
  const base = origin?.trim() || (typeof window !== "undefined" ? window.location.origin : "");
  return `${base.replace(/\/$/, "")}${buildCastDisplayPath(displayType)}`;
}

export function displayTypeLabel(displayType: DisplayType) {
  return displayType === "staff_whiteboard" ? "Staff Digital Whiteboard" : "Lobby Whiteboard";
}

export function isDisplayDeviceOnline(lastSeenAt: string | null | undefined, now = Date.now()) {
  if (!lastSeenAt) return false;
  const seen = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(seen)) return false;
  return now - seen <= CAST_KEEPER_OFFLINE_DEVICE_MS;
}

export function publicAppVersion() {
  return getPublicBuildId();
}
