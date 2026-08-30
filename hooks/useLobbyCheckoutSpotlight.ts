"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LobbyCheckoutDog } from "@/lib/lobby/types";
import {
  advanceCheckoutSpotlightState,
  checkoutSpotlightIsActive,
  emptyCheckoutSpotlightState,
  getActiveSpotlightDogs,
  getCheckoutSpotlightEventKey,
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
    const completedKeys = state.completedKeys.slice(-80);
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, completedKeys }));
  } catch {
    // Ignore quota / private mode failures.
  }
}

function statesEqual(a: CheckoutSpotlightState, b: CheckoutSpotlightState) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function dogsSignature(dogs: LobbyCheckoutDog[]) {
  return dogs.map((dog) => getCheckoutSpotlightEventKey(dog)).join("|");
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
  const signature = dogsSignature(dogs);
  const dogsRef = useRef(dogs);

  const [state, setState] = useState<CheckoutSpotlightState>(() => {
    const stored = typeof window !== "undefined" ? readStoredState() : null;
    if (stored) return advanceCheckoutSpotlightState(stored, Date.now(), { fast });
    return emptyCheckoutSpotlightState();
  });
  const [nowMs, setNowMs] = useState(() => Date.now());
  const fastRef = useRef(fast);

  useEffect(() => {
    dogsRef.current = dogs;
    fastRef.current = fast;
  }, [dogs, fast]);

  useEffect(() => {
    if (!enabled) return;
    const now = Date.now();
    setState((prev) => {
      let next = syncCheckoutSpotlightQueue(prev, dogsRef.current, now);
      next = advanceCheckoutSpotlightState(next, now, { fast: fastRef.current });
      if (statesEqual(prev, next)) return prev;
      writeStoredState(next);
      return next;
    });
  }, [enabled, signature, fast]);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setNowMs(now);
      setState((prev) => {
        if (!prev.window && prev.queue.length === 0) return prev;
        const next = advanceCheckoutSpotlightState(prev, now, { fast: fastRef.current });
        if (statesEqual(prev, next)) return prev;
        writeStoredState(next);
        return next;
      });
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [enabled]);

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
      const next = advanceCheckoutSpotlightState(forced, Date.now(), { fast: fastRef.current });
      writeStoredState(next);
      return next;
    });
  }, []);

  return {
    active,
    dogs: activeDogs,
    remainingMs,
    window: state.window,
    queueLength: state.queue.length,
    dismissCurrentWindow
  };
}
