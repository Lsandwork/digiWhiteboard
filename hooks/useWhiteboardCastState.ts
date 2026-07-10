"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import type { CastBoardType } from "@/lib/whiteboard/cast-options";
import {
  WHITEBOARD_STATE_POLL_MS,
  type WhiteboardStateResponse
} from "@/lib/whiteboard/state";

export type CastHealthStatus = {
  lastSuccessAt: string | null;
  version: string | null;
  reconnectCount: number;
  polling: boolean;
  lastError: string | null;
};

type UseWhiteboardCastStateOptions = {
  board: CastBoardType;
  noVideo?: boolean;
  pollMs?: number;
  enabled?: boolean;
  realtime?: boolean;
  debug?: boolean;
};

const FETCH_TIMEOUT_MS = 6000;

function debugLog(enabled: boolean, message: string, details?: Record<string, unknown>) {
  if (!enabled) return;
  if (details) {
    console.info(`[FitdogBoardDebug] ${message}`, details);
    return;
  }
  console.info(`[FitdogBoardDebug] ${message}`);
}

async function fetchWhiteboardState(
  board: CastBoardType,
  noVideo: boolean,
  etag?: string | null,
  debug = false
) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const params = new URLSearchParams({ board });
    if (noVideo) params.set("noVideo", "1");
    if (debug) params.set("debugBoard", "1");
    const headers: Record<string, string> = {};
    if (etag) headers["if-none-match"] = `"${etag}"`;

    const response = await fetch(`/api/whiteboard/state?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
      headers
    });

    if (response.status === 304) {
      return { unchanged: true as const };
    }

    const body = (await response.json()) as WhiteboardStateResponse & { error?: string };
    if (!response.ok) {
      throw new Error(body.error ?? `Whiteboard state failed (${response.status}).`);
    }

    return {
      unchanged: false as const,
      state: body,
      etag: response.headers.get("etag")?.replace(/"/g, "") ?? body.version
    };
  } finally {
    window.clearTimeout(timer);
  }
}

export function useWhiteboardCastState({
  board,
  noVideo = false,
  pollMs = WHITEBOARD_STATE_POLL_MS,
  enabled = true,
  realtime = false,
  debug = false
}: UseWhiteboardCastStateOptions) {
  const [state, setState] = useState<WhiteboardStateResponse | null>(null);
  const [showReconnecting, setShowReconnecting] = useState(false);
  const [health, setHealth] = useState<CastHealthStatus>({
    lastSuccessAt: null,
    version: null,
    reconnectCount: 0,
    polling: true,
    lastError: null
  });

  const etagRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  const reconnectCountRef = useRef(0);
  const backoffUntilRef = useRef(0);
  const failureCountRef = useRef(0);
  const lastGoodRef = useRef<WhiteboardStateResponse | null>(null);
  const debugRef = useRef(debug);

  useEffect(() => {
    debugRef.current = debug;
  }, [debug]);

  const applyState = useCallback((next: WhiteboardStateResponse) => {
    lastGoodRef.current = next;
    setState((current) => {
      if (current?.version === next.version) return current;
      return next;
    });
    etagRef.current = next.version;
    failureCountRef.current = 0;
    backoffUntilRef.current = 0;
    setHealth((current) => ({
      ...current,
      lastSuccessAt: new Date().toISOString(),
      version: next.version,
      lastError: null,
      polling: true
    }));
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled || inFlightRef.current) return;
    const now = Date.now();
    if (backoffUntilRef.current > now) {
      debugLog(debugRef.current, "cast state backoff skip", {
        remainingMs: backoffUntilRef.current - now
      });
      return;
    }

    inFlightRef.current = true;
    try {
      const result = await fetchWhiteboardState(board, noVideo, etagRef.current, debugRef.current);
      if (!result.unchanged && result.state) {
        applyState(result.state);
      } else if (result.unchanged) {
        setHealth((current) => ({
          ...current,
          lastSuccessAt: new Date().toISOString(),
          lastError: null
        }));
      }
    } catch (error) {
      reconnectCountRef.current += 1;
      failureCountRef.current += 1;
      const backoffMs = Math.min(30_000, 1000 * 2 ** Math.min(failureCountRef.current - 1, 5));
      backoffUntilRef.current = Date.now() + backoffMs;
      const message = error instanceof Error ? error.message : "Unable to refresh cast state.";
      debugLog(debugRef.current, "cast state fetch failed; keeping last good", {
        error: message,
        backoffMs,
        hasLastGood: Boolean(lastGoodRef.current)
      });
      // Never clear last-good state on failure — keep showing stable board.
      setHealth((current) => ({
        ...current,
        reconnectCount: reconnectCountRef.current,
        lastError: message
      }));
    } finally {
      inFlightRef.current = false;
    }
  }, [applyState, board, enabled, noVideo]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const pollTimer = window.setInterval(() => void refresh(), pollMs);
    return () => window.clearInterval(pollTimer);
  }, [enabled, pollMs, refresh]);

  useEffect(() => {
    if (!enabled || !realtime) return;
    const supabase = getBrowserSupabase();
    if (!supabase) return;

    let debounceTimer: number | null = null;
    let cancelled = false;

    const scheduleRefresh = () => {
      if (debounceTimer) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        if (!cancelled) void refresh();
      }, 1500);
    };

    const channel = supabase
      .channel(`cast-lite-${board}-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "live_transition_dogs" }, scheduleRefresh)
      .subscribe();

    return () => {
      cancelled = true;
      if (debounceTimer) window.clearTimeout(debounceTimer);
      void supabase.removeChannel(channel);
    };
  }, [board, enabled, realtime, refresh]);

  useEffect(() => {
    const updateReconnecting = () => {
      const reconnecting =
        Boolean(health.lastError) &&
        (!health.lastSuccessAt || Date.now() - new Date(health.lastSuccessAt).getTime() > 30_000);
      setShowReconnecting(reconnecting);
    };

    updateReconnecting();
    const timer = window.setInterval(updateReconnecting, 5000);
    return () => window.clearInterval(timer);
  }, [health.lastError, health.lastSuccessAt]);

  return {
    state,
    health,
    showReconnecting,
    refresh
  };
}
