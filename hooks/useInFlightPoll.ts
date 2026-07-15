"use client";

import { useCallback, useRef } from "react";

type InFlightPollOptions = {
  /** When true, rerun once after the current task finishes instead of dropping. */
  rerunIfBusy?: boolean;
};

export function useInFlightPoll() {
  const inFlightRef = useRef(false);
  const pendingRef = useRef(false);

  return useCallback(async (task: () => Promise<void>, options: InFlightPollOptions = {}) => {
    if (inFlightRef.current) {
      if (options.rerunIfBusy) pendingRef.current = true;
      return false;
    }

    inFlightRef.current = true;
    try {
      do {
        pendingRef.current = false;
        await task();
      } while (pendingRef.current);
      return true;
    } finally {
      inFlightRef.current = false;
    }
  }, []);
}
