"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LobbyCheckoutDog } from "@/lib/lobby/types";
import {
  advanceCheckoutSpotlightState,
  checkoutSpotlightIsActive,
  emptyCheckoutSpotlightState,
  getActiveSpotlightDogs,
  spotlightRemainingMs,
  syncCheckoutSpotlightQueue,
  type CheckoutSpotlightState
} from "@/lib/lobby/checkout-spotlight-queue";

const STORAGE_KEY = "fitdog-lobby-checkout-spotlight-v1";
const TICK_MS = 1000;

function readStoredState(): CheckoutSpotlightState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CheckoutSpotlightState;
    if (!parsed || !Array.isArray(parsed.queue) || !Array.isArray(parsed.completedKeys)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredState(state: CheckoutSpotlightState) {
  if (typeof window === "undefined") return;
  try {
    // Cap completed keys so sessionStorage stays small on long-running TVs.
    const completedKeys = state.completedKeys.slice(-80);
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...state, completedKeys })
    );
  } catch {
    // Ignore quota / private mode failures.
  }
}

function statesEqual(a: CheckoutSpotlightState, b: CheckoutSpotlightState) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Checkout spotlight queue controller.
 * Reuses live lobby checkout dogs — no extra polling.
 */
export function useLobbyCheckoutSpotlight(
  dogs: LobbyCheckoutDog[],
  options?: { enabled?: boolean; fastDurations?: boolean }
) {
  const enabled = options?.enabled !== false;
  const fast = Boolean(options?.fastDurations);
  const [state, setState] = useState<CheckoutSpotlightState>(() => emptyCheckoutSpotlightState());
  const [nowMs, setNowMs] = useState(() => Date.now());
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (!enabled || hydratedRef.current) return;
    hydratedRef.current = true;
    const stored = readStoredState();
    if (stored) {
      const advanced = advanceCheckoutSpotlightState(stored, Date.now(), { fast });
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate sessionStorage once on mount
      setState(advanced);
      writeStoredState(advanced);
    }
  }, [enabled, fast]);

  useEffect(() => {
    if (!enabled) return;
    const now = Date.now();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync live checkout dogs into the queue state machine
    setState((prev) => {
      let next = syncCheckoutSpotlightQueue(prev, dogs, now);
      next = advanceCheckoutSpotlightState(next, now, { fast });
      if (statesEqual(prev, next)) return prev;
      writeStoredState(next);
      return next;
    });
  }, [dogs, enabled, fast]);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setNowMs(now);
      setState((prev) => {
        if (!prev.window) return prev;
        const next = advanceCheckoutSpotlightState(prev, now, { fast });
        if (statesEqual(prev, next)) return prev;
        writeStoredState(next);
        return next;
      });
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [enabled, fast]);

  const activeDogs = useMemo(() => getActiveSpotlightDogs(state), [state]);
  const active = enabled && checkoutSpotlightIsActive(state);
  const remainingMs = spotlightRemainingMs(state, nowMs);

  const dismissCurrentWindow = useCallback(() => {
    setState((prev) => {
      if (!prev.window) return prev;
      const forced: CheckoutSpotlightState = {
        ...prev,
        window: { ...prev.window, startedAt: 0, durationMs: 0 }
      };
      const next = advanceCheckoutSpotlightState(forced, Date.now(), { fast });
      writeStoredState(next);
      return next;
    });
  }, [fast]);

  return {
    active,
    dogs: activeDogs,
    remainingMs,
    window: state.window,
    queueLength: state.queue.length,
    dismissCurrentWindow
  };
}
