"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { useScreenWakeLock } from "@/hooks/useScreenWakeLock";
import {
  applyDisplaySyncUpdate,
  readInitialDisplaySync
} from "@/lib/display-keeper-client";
import {
  CAST_KEEPER_HEARTBEAT_MS,
  CAST_KEEPER_RECONNECT_HEARTBEAT_MS,
  CAST_KEEPER_RELOAD_COOLDOWN_MS,
  CAST_KEEPER_STALE_MS,
  getOrCreateDisplayDeviceId,
  type DisplayType,
  type HeartbeatResponse
} from "@/lib/display-keeper";
import { writeStoredDisplaySync } from "@/lib/display-sync";

export type CastKeeperConnection = "online" | "reconnecting" | "offline";

type CastKeeperContextValue = {
  connection: CastKeeperConnection;
  lastHeartbeatAt: string | null;
  lastDataAt: string | null;
  wakeLockStatus: string;
  markDataFresh: () => void;
};

const CastKeeperContext = createContext<CastKeeperContextValue | null>(null);

export function useCastKeeperContext() {
  return useContext(CastKeeperContext);
}

type UseCastKeeperOptions = {
  displayType: DisplayType;
  route: string;
  enabled?: boolean;
  onContentUpdate?: () => void;
};

async function ackDisplayCommands(commandIds: string[]) {
  if (!commandIds.length) return;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch("/api/displays/commands/ack", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ commandIds })
      });
      if (response.ok) return;
    } catch {
      // Retry below.
    }

    await new Promise((resolve) => window.setTimeout(resolve, 500 * (attempt + 1)));
  }
}

async function postHeartbeat(body: Record<string, unknown>) {
  const response = await fetch("/api/displays/heartbeat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(body)
  });
  if (!response.ok) return null;
  return (await response.json()) as HeartbeatResponse;
}

function safeReload() {
  if (typeof window === "undefined") return;
  window.location.reload();
}

export function useCastKeeper({
  displayType,
  route,
  enabled = true,
  onContentUpdate
}: UseCastKeeperOptions) {
  const onContentUpdateRef = useRef(onContentUpdate);
  const lastDataAtRef = useRef<number>(Date.now());
  const lastHeartbeatOkRef = useRef<number>(Date.now());
  const lastReloadAtRef = useRef<number>(0);
  const syncRef = useRef<HeartbeatResponse["sync"] | null>(null);
  const deviceIdRef = useRef(getOrCreateDisplayDeviceId());
  const [connection, setConnection] = useState<CastKeeperConnection>("online");
  const [lastHeartbeatAt, setLastHeartbeatAt] = useState<string | null>(null);
  const [lastDataAt, setLastDataAt] = useState<string | null>(new Date().toISOString());
  const { status: wakeLockStatus, requestWakeLock } = useScreenWakeLock({
    enabled,
    persistent: true,
    aggressive: true
  });
  const wakeLockStatusRef = useRef(wakeLockStatus);
  const connectionRef = useRef<CastKeeperConnection>("online");

  useEffect(() => {
    onContentUpdateRef.current = onContentUpdate;
  }, [onContentUpdate]);

  useEffect(() => {
    wakeLockStatusRef.current = wakeLockStatus;
  }, [wakeLockStatus]);

  useEffect(() => {
    connectionRef.current = connection;
  }, [connection]);

  const markDataFresh = useCallback(() => {
    const now = Date.now();
    lastDataAtRef.current = now;
    setLastDataAt(new Date(now).toISOString());
    if (connectionRef.current === "offline") {
      connectionRef.current = "online";
      setConnection("online");
    }
  }, []);

  const maybeReloadStale = useCallback(() => {
    const now = Date.now();
    const staleFor = Math.max(now - lastDataAtRef.current, now - lastHeartbeatOkRef.current);
    if (staleFor < CAST_KEEPER_STALE_MS) return;
    if (now - lastReloadAtRef.current < CAST_KEEPER_RELOAD_COOLDOWN_MS) return;
    lastReloadAtRef.current = now;
    safeReload();
  }, []);

  const processCommands = useCallback(async (commands: HeartbeatResponse["commands"]) => {
    if (!commands.length) return;
    const hardRefresh = commands.some((command) => command.command_type === "hard_refresh");
    const commandIds = commands.map((command) => command.id);
    if (commandIds.length) {
      void ackDisplayCommands(commandIds);
    }
    if (hardRefresh) {
      const now = Date.now();
      if (now - lastReloadAtRef.current >= CAST_KEEPER_RELOAD_COOLDOWN_MS) {
        lastReloadAtRef.current = now;
        safeReload();
      }
    }
  }, []);

  const runHeartbeat = useCallback(async () => {
    try {
      const body = await postHeartbeat({
        deviceId: deviceIdRef.current,
        displayType,
        route,
        status: navigator.onLine ? "online" : "offline",
        wakeLockStatus: wakeLockStatusRef.current,
        lastDataAt: new Date(lastDataAtRef.current).toISOString()
      });

      if (!body?.ok) {
        const nextConnection = navigator.onLine ? "reconnecting" : "offline";
        connectionRef.current = nextConnection;
        setConnection(nextConnection);
        return;
      }

      const now = Date.now();
      lastHeartbeatOkRef.current = now;
      setLastHeartbeatAt(body.serverTime);
      connectionRef.current = "online";
      setConnection("online");

      if (syncRef.current) {
        applyDisplaySyncUpdate(body.sync, syncRef.current, () => onContentUpdateRef.current?.());
      } else {
        const stored = readInitialDisplaySync();
        if (stored) {
          applyDisplaySyncUpdate(body.sync, stored, () => onContentUpdateRef.current?.());
        } else {
          onContentUpdateRef.current?.();
        }
      }
      syncRef.current = body.sync;
      writeStoredDisplaySync(body.sync);

      await processCommands(body.commands);
    } catch {
      const nextConnection = navigator.onLine ? "reconnecting" : "offline";
      connectionRef.current = nextConnection;
      setConnection(nextConnection);
    }
  }, [displayType, processCommands, route]);

  useEffect(() => {
    if (!enabled) return;
    void requestWakeLock();
  }, [enabled, requestWakeLock]);

  useEffect(() => {
    if (!enabled) return;

    const updatePaused = () => {
      document.documentElement.classList.toggle("cast-keeper-paused", document.visibilityState === "hidden");
    };

    updatePaused();
    document.addEventListener("visibilitychange", updatePaused);

    return () => {
      document.removeEventListener("visibilitychange", updatePaused);
      document.documentElement.classList.remove("cast-keeper-paused");
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    syncRef.current = readInitialDisplaySync();
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    const handleOnline = () => {
      setConnection("reconnecting");
      void runHeartbeat();
    };
    const handleOffline = () => setConnection("offline");
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void requestWakeLock();
        void runHeartbeat();
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [enabled, requestWakeLock, runHeartbeat]);

  useEffect(() => {
    if (!enabled) return;

    let heartbeatTimer: number | null = null;
    let cancelled = false;

    const scheduleHeartbeat = () => {
      if (cancelled) return;
      const delay =
        connectionRef.current === "reconnecting"
          ? CAST_KEEPER_RECONNECT_HEARTBEAT_MS
          : CAST_KEEPER_HEARTBEAT_MS;
      heartbeatTimer = window.setTimeout(async () => {
        await runHeartbeat();
        scheduleHeartbeat();
      }, delay);
    };

    void runHeartbeat();
    scheduleHeartbeat();
    const staleTimer = window.setInterval(maybeReloadStale, 30_000);

    return () => {
      cancelled = true;
      if (heartbeatTimer) window.clearTimeout(heartbeatTimer);
      window.clearInterval(staleTimer);
    };
  }, [enabled, maybeReloadStale, runHeartbeat]);

  return useMemo(
    () => ({
      connection,
      lastHeartbeatAt,
      lastDataAt,
      wakeLockStatus,
      markDataFresh
    }),
    [connection, lastDataAt, lastHeartbeatAt, markDataFresh, wakeLockStatus]
  );
}

type CastKeeperProviderProps = {
  displayType: DisplayType;
  route: string;
  enabled?: boolean;
  onContentUpdate?: () => void;
  children: ReactNode;
};

export function CastKeeperProvider({
  displayType,
  route,
  enabled = true,
  onContentUpdate,
  children
}: CastKeeperProviderProps) {
  const value = useCastKeeper({ displayType, route, enabled, onContentUpdate });
  return <CastKeeperContext.Provider value={value}>{children}</CastKeeperContext.Provider>;
}
