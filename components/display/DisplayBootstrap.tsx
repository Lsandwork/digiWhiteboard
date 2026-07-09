"use client";

import { useEffect } from "react";
import { startDisplayKeepaliveFallback } from "@/lib/display-keepalive-fallback";

/** Early TV/display keepalive — runs before board trees mount on cast routes. */
export function DisplayBootstrap() {
  useEffect(() => {
    document.documentElement.classList.add("cast-keeper-display");
    // Keepalive stays active for the full display session; Cast Keeper also holds a consumer.
    startDisplayKeepaliveFallback();

    return () => {
      document.documentElement.classList.remove("cast-keeper-display");
    };
  }, []);

  return null;
}
