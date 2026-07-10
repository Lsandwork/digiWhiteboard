"use client";

import { useEffect } from "react";
import { startDisplayKeepaliveFallback } from "@/lib/display-keepalive-fallback";

/** Early TV/display keepalive — runs before board trees mount on cast routes. */
export function DisplayBootstrap() {
  useEffect(() => {
    document.documentElement.classList.add("cast-keeper-display");
    startDisplayKeepaliveFallback();

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
    if (siteUrl) {
      try {
        const origin = new URL(siteUrl).origin;
        for (const rel of ["preconnect", "dns-prefetch"] as const) {
          if (document.querySelector(`link[rel="${rel}"][href="${origin}"]`)) continue;
          const link = document.createElement("link");
          link.rel = rel;
          link.href = origin;
          document.head.appendChild(link);
        }
      } catch {
        // Ignore invalid site URL.
      }
    }

    return () => {
      document.documentElement.classList.remove("cast-keeper-display");
    };
  }, []);

  return null;
}
