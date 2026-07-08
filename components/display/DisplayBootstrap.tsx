"use client";

import { useEffect } from "react";
import { startDisplayKeepaliveFallback } from "@/lib/display-keepalive-fallback";

/** Early TV/display keepalive — runs before board trees mount on cast routes. */
export function DisplayBootstrap() {
  useEffect(() => {
    document.documentElement.classList.add("cast-keeper-display");
    const stopKeepalive = startDisplayKeepaliveFallback();

    return () => {
      stopKeepalive();
      document.documentElement.classList.remove("cast-keeper-display");
    };
  }, []);

  return null;
}
