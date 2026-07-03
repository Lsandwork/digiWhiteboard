"use client";

import { useCallback, useRef } from "react";

export function useInFlightPoll() {
  const inFlightRef = useRef(false);

  return useCallback(async (task: () => Promise<void>) => {
    if (inFlightRef.current) return false;

    inFlightRef.current = true;
    try {
      await task();
      return true;
    } finally {
      inFlightRef.current = false;
    }
  }, []);
}
