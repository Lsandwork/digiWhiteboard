/**
 * Client/TV display resolution for the Team Lead digital whiteboard.
 *
 * Empty arrays are never treated as "All Clear". That status is only valid after
 * a successful, validated Gingr evaluation with zero outstanding items.
 */
import { periodLabel } from "./medication-windows";
import type { TlMedicationPeriod } from "./constants";
import type {
  TlBoardDisplayState,
  TlBoardSyncMeta,
  TlGingrSourceHealth
} from "./types";

export const TL_RETRY_BACKOFF_MS = [10_000, 20_000, 30_000, 60_000] as const;
export const TL_HEALTHY_POLL_MS = 12_000;
export const TL_WAKE_RESYNC_MIN_MS = 15_000;
/** TV client must not wait forever if the board API hangs. */
export const TL_BOARD_CLIENT_FETCH_TIMEOUT_MS = 12_000;

export type TlCardKind = "checking" | "all_clear" | "error" | "stale" | "rows";

export type TlHeaderKind = "syncing" | "live" | "delayed" | "stale" | "issue";

export function nextTlRetryDelayMs(consecutiveFailures: number): number {
  const index = Math.max(0, Math.min(consecutiveFailures, TL_RETRY_BACKOFF_MS.length - 1));
  return TL_RETRY_BACKOFF_MS[index]!;
}

export function planTlBoardRefresh(params: {
  consecutiveFailures: number;
  boardState: TlBoardDisplayState | null;
  force?: boolean;
}): { delayMs: number; force: boolean } {
  const failed =
    params.consecutiveFailures > 0 ||
    params.boardState === "CONNECTION_ERROR" ||
    params.boardState === "PARTIAL_DATA_ERROR";
  if (params.force) {
    return { delayMs: 0, force: true };
  }
  if (failed) {
    return { delayMs: nextTlRetryDelayMs(Math.max(0, params.consecutiveFailures - 1)), force: false };
  }
  return { delayMs: TL_HEALTHY_POLL_MS, force: false };
}

export function shouldResyncOnWake(params: {
  lastAttemptAtMs: number | null;
  nowMs: number;
  boardState: TlBoardDisplayState | null;
}): boolean {
  if (!params.lastAttemptAtMs) return true;
  const age = params.nowMs - params.lastAttemptAtMs;
  if (age >= TL_WAKE_RESYNC_MIN_MS) return true;
  return (
    params.boardState === "CONNECTION_ERROR" ||
    params.boardState === "PARTIAL_DATA_ERROR" ||
    params.boardState === "STALE" ||
    params.boardState === "INITIAL_LOADING"
  );
}

export function resolveTlCardKind(params: {
  phase: "initial" | "resolved";
  health: TlGingrSourceHealth | null | undefined;
  allClear: boolean;
  hasRows: boolean;
}): TlCardKind {
  if (params.phase === "initial") return "checking";
  if (params.hasRows) return params.health === "ok" ? "rows" : "stale";
  const health = params.health ?? "error";
  if (health === "unevaluated") return "error";
  if (health === "error") return "error";
  if (health === "stale") return "stale";
  if (params.allClear && health === "ok") return "all_clear";
  // Successful Gingr eval with zero actionable doses — not a verification failure.
  if (health === "ok" && !params.hasRows) return "all_clear";
  return "error";
}

export function resolveTlHeaderKind(params: {
  phase: "initial" | "resolved";
  boardState: TlBoardDisplayState | null | undefined;
  gingrSyncHealth: TlBoardSyncMeta["gingrSyncHealth"] | null | undefined;
}): TlHeaderKind {
  if (params.phase === "initial" || params.boardState === "INITIAL_LOADING") return "syncing";
  if (params.boardState === "CONNECTION_ERROR" || params.boardState === "PARTIAL_DATA_ERROR") {
    return "issue";
  }
  if (params.boardState === "STALE" || params.gingrSyncHealth === "connection_issue") return "stale";
  if (params.gingrSyncHealth === "delayed") return "delayed";
  if (params.gingrSyncHealth === "live" || params.boardState === "LIVE" || params.boardState === "EMPTY_VALID") {
    return "live";
  }
  return "issue";
}

export function headerLabelForKind(kind: TlHeaderKind): string {
  switch (kind) {
    case "syncing":
      return "Syncing with Gingr…";
    case "live":
      return "GINGR • LIVE";
    case "delayed":
      return "GINGR ⚠ SYNC DELAY";
    case "stale":
      return "Showing last synced data";
    case "issue":
      return "⚠ Gingr Sync Issue";
  }
}

/** Period is a clock fact in America/Los_Angeles — never wait on Gingr for this label. */
export function headerPeriodText(
  apiPeriod: TlMedicationPeriod | null | undefined,
  clockPeriod: TlMedicationPeriod | null
): string {
  const period = apiPeriod ?? clockPeriod;
  return period ? periodLabel(period) : "—";
}

/** Last successful Gingr sync. Blank em dashes are reserved for the first paint before the clock hydrates. */
export function headerLastSyncText(params: {
  phase: "initial" | "resolved";
  formattedSuccess: string | null;
}): string {
  if (params.formattedSuccess) return params.formattedSuccess;
  if (params.phase === "initial") return "Checking…";
  return "Never";
}

/** True when a later successful payload should clear a previous Gingr outage without a page reload. */
export function didTlBoardRecover(params: {
  previousState: TlBoardDisplayState | null;
  nextState: TlBoardDisplayState;
}): boolean {
  const wasDown =
    params.previousState === "CONNECTION_ERROR" ||
    params.previousState === "PARTIAL_DATA_ERROR" ||
    params.previousState === "STALE" ||
    params.previousState === "INITIAL_LOADING";
  return wasDown && (params.nextState === "LIVE" || params.nextState === "EMPTY_VALID");
}

type TlClientBoardPayload = {
  medications?: unknown[];
  overdue?: unknown[];
  current?: unknown[];
  additionalServices?: unknown[];
  reminders?: unknown[];
  config?: unknown;
  meta?: {
    lastSuccessfulSyncAt?: string | null;
    lastAttemptAt?: string | null;
    lastError?: string | null;
    medicationsHealth?: string;
    servicesHealth?: string;
    boardState?: string;
    isStale?: boolean;
  };
  error?: string;
};

function payloadHasUsableGingrData(payload: TlClientBoardPayload | null | undefined) {
  if (!payload) return false;
  return Boolean(
    payload.meta?.lastSuccessfulSyncAt ||
      (payload.medications && payload.medications.length) ||
      (payload.overdue && payload.overdue.length) ||
      (payload.current && payload.current.length)
  );
}

/**
 * TV board must never replace a known-good Gingr snapshot with an empty
 * CONNECTION_ERROR payload. That is what caused "Never synced" + reboot loops.
 */
export function mergeTlBoardClientPayload<T extends TlClientBoardPayload>(previous: T | null, incoming: T): T {
  if (payloadHasUsableGingrData(incoming)) return incoming;
  if (!previous || !payloadHasUsableGingrData(previous)) return incoming;
  return {
    ...previous,
    config: incoming.config ?? previous.config,
    reminders: incoming.reminders ?? previous.reminders,
    error: undefined,
    meta: {
      ...previous.meta,
      lastAttemptAt: incoming.meta?.lastAttemptAt ?? previous.meta?.lastAttemptAt,
      lastError: incoming.meta?.lastError ?? previous.meta?.lastError,
      isStale: true,
      medicationsHealth: previous.medications?.length ? "stale" : previous.meta?.medicationsHealth,
      servicesHealth: previous.additionalServices?.length ? "stale" : previous.meta?.servicesHealth,
      boardState: "STALE"
    }
  };
}
