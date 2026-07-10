"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  RECEIVER_HEARTBEAT_MS,
  RECEIVER_STATE_POLL_MS,
  RECEIVER_TOKEN_HEADER,
  RECEIVER_TOKEN_STORAGE_KEY,
  type RemoteCastReceiverState,
  type RemoteCastScreen
} from "@/lib/remote-cast/types";

type ConnectionState = "connecting" | "online" | "reconnecting";

export type RemoteCastReceiverRuntime = {
  ready: boolean;
  paired: boolean;
  activeScreen: RemoteCastScreen;
  displayName: string | null;
  pairingCode: string | null;
  pairingExpired: boolean;
  refreshNonce: number;
  connection: ConnectionState;
  lastError: string | null;
};

const REQUEST_TIMEOUT_MS = 9_000;

function readStoredToken(): string | null {
  try {
    return window.localStorage.getItem(RECEIVER_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredToken(token: string) {
  try {
    window.localStorage.setItem(RECEIVER_TOKEN_STORAGE_KEY, token);
  } catch {
    // Locked-down browsers (private mode / kiosk): fall back to in-memory token.
  }
}

function clearStoredToken() {
  try {
    window.localStorage.removeItem(RECEIVER_TOKEN_STORAGE_KEY);
  } catch {
    // Ignore.
  }
}

async function fetchWithTimeout(input: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

const DEFAULT_STATE: RemoteCastReceiverState = {
  paired: false,
  displayName: null,
  activeScreen: "standby",
  pairingCode: null,
  pairingExpired: false,
  refreshNonce: 0,
  updatedAt: null
};

export function useRemoteCastReceiver(debugBoard = false): RemoteCastReceiverRuntime {
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<RemoteCastReceiverState>(DEFAULT_STATE);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [lastError, setLastError] = useState<string | null>(null);

  const tokenRef = useRef<string | null>(null);
  const registeringRef = useRef(false);
  const mountedRef = useRef(true);

  const debug = useCallback(
    (message: string, details?: Record<string, unknown>) => {
      if (!debugBoard) return;
      if (details) console.info(`[RemoteCastReceiver] ${message}`, details);
      else console.info(`[RemoteCastReceiver] ${message}`);
    },
    [debugBoard]
  );

  const applyState = useCallback((next: RemoteCastReceiverState) => {
    setState((prev) => {
      if (
        prev.paired === next.paired &&
        prev.activeScreen === next.activeScreen &&
        prev.displayName === next.displayName &&
        prev.pairingCode === next.pairingCode &&
        prev.pairingExpired === next.pairingExpired &&
        prev.refreshNonce === next.refreshNonce
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  const register = useCallback(async () => {
    if (registeringRef.current) return;
    registeringRef.current = true;
    try {
      const existing = tokenRef.current ?? readStoredToken();
      const response = await fetchWithTimeout("/api/remote-cast/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ token: existing ?? undefined })
      });
      if (!response.ok) throw new Error(`Register failed (${response.status}).`);
      const body = (await response.json()) as {
        receiverId: string;
        receiverToken: string | null;
        state: RemoteCastReceiverState;
      };
      if (body.receiverToken) {
        tokenRef.current = body.receiverToken;
        writeStoredToken(body.receiverToken);
      } else if (existing) {
        tokenRef.current = existing;
      }
      if (!mountedRef.current) return;
      applyState(body.state);
      setConnection("online");
      setLastError(null);
      setReady(true);
      debug("registered", { receiverId: body.receiverId, paired: body.state.paired });
    } catch (error) {
      if (!mountedRef.current) return;
      setConnection((prev) => (prev === "online" ? "reconnecting" : "connecting"));
      setLastError(error instanceof Error ? error.message : "Register failed.");
      debug("register error", { error: String(error) });
    } finally {
      registeringRef.current = false;
    }
  }, [applyState, debug]);

  const pollState = useCallback(async () => {
    const token = tokenRef.current;
    if (!token) {
      await register();
      return;
    }
    try {
      const response = await fetchWithTimeout("/api/remote-cast/state", {
        method: "GET",
        headers: { [RECEIVER_TOKEN_HEADER]: token },
        cache: "no-store"
      });
      if (response.status === 404) {
        debug("receiver unknown — re-registering");
        tokenRef.current = null;
        clearStoredToken();
        await register();
        return;
      }
      if (!response.ok) throw new Error(`State poll failed (${response.status}).`);
      const body = (await response.json()) as { state: RemoteCastReceiverState };
      if (!mountedRef.current) return;
      applyState(body.state);
      setConnection("online");
      setLastError(null);
      setReady(true);
    } catch (error) {
      if (!mountedRef.current) return;
      // Keep showing the last known screen — only downgrade the connection badge.
      setConnection("reconnecting");
      setLastError(error instanceof Error ? error.message : "State poll failed.");
      debug("state poll error", { error: String(error) });
    }
  }, [applyState, debug, register]);

  const heartbeat = useCallback(async () => {
    const token = tokenRef.current;
    if (!token) return;
    try {
      const response = await fetchWithTimeout("/api/remote-cast/heartbeat", {
        method: "POST",
        headers: { "content-type": "application/json", [RECEIVER_TOKEN_HEADER]: token },
        cache: "no-store",
        body: JSON.stringify({ activeScreen: state.activeScreen })
      });
      if (response.status === 404) {
        tokenRef.current = null;
        clearStoredToken();
        await register();
        return;
      }
      if (!response.ok) return;
      const body = (await response.json()) as { state: RemoteCastReceiverState };
      if (!mountedRef.current) return;
      applyState(body.state);
      setConnection("online");
    } catch (error) {
      debug("heartbeat error", { error: String(error) });
    }
  }, [applyState, debug, register, state.activeScreen]);

  useEffect(() => {
    mountedRef.current = true;
    tokenRef.current = readStoredToken();
    void register();
    return () => {
      mountedRef.current = false;
    };
  }, [register]);

  useEffect(() => {
    const timer = window.setInterval(() => void pollState(), RECEIVER_STATE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [pollState]);

  useEffect(() => {
    const timer = window.setInterval(() => void heartbeat(), RECEIVER_HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [heartbeat]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void pollState();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [pollState]);

  return {
    ready,
    paired: state.paired,
    activeScreen: state.activeScreen,
    displayName: state.displayName,
    pairingCode: state.pairingCode,
    pairingExpired: state.pairingExpired,
    refreshNonce: state.refreshNonce,
    connection,
    lastError
  };
}
