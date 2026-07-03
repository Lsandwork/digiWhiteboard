"use client";

import { useCallback, useEffect, useRef } from "react";

export function useDebouncedCallback<T extends (...args: never[]) => void>(callback: T, delayMs: number) {
  const callbackRef = useRef(callback);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  return useCallback(
    (...args: Parameters<T>) => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        callbackRef.current(...args);
      }, delayMs);
    },
    [delayMs]
  );
}
