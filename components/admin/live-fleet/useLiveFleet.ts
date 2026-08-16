"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveFleetSnapshot } from "@/lib/live-fleet/types";

const POLL_MS = 8_000;

export function useLiveFleet() {
  const [snapshot, setSnapshot] = useState<LiveFleetSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const mountedRef = useRef(true);
  const inflightRef = useRef(false);

  const load = useCallback(async (opts?: { refresh?: boolean }) => {
    if (inflightRef.current) return;
    inflightRef.current = true;
    if (opts?.refresh) setRefreshing(true);
    try {
      const qs = opts?.refresh ? "?refresh=1" : "";
      const response = await fetch(`/api/admin/live-fleet${qs}`, { cache: "no-store" });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Live Fleet request failed (${response.status})`);
      }
      const data = (await response.json()) as LiveFleetSnapshot;
      if (!mountedRef.current) return;
      setSnapshot(data);
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : "Unable to load Live Fleet");
    } finally {
      inflightRef.current = false;
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const boot = window.setTimeout(() => {
      void load();
    }, 0);
    const timer = window.setInterval(() => {
      void load();
    }, POLL_MS);
    return () => {
      mountedRef.current = false;
      window.clearTimeout(boot);
      window.clearInterval(timer);
    };
  }, [load]);

  return {
    snapshot,
    loading,
    error,
    refreshing,
    refresh: () => load({ refresh: true }),
    reload: () => load()
  };
}
