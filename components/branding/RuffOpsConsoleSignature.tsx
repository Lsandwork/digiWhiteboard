"use client";

import { useEffect } from "react";
import {
  RUFFOPS_CONSOLE_LINES,
  RUFFOPS_CONSOLE_STYLES,
  RUFFOPS_TAGLINE
} from "@/lib/branding/ruffops-signature";

const SESSION_KEY = "ruffops-console-signature-shown";

/**
 * Tasteful one-time DevTools console signature.
 * No secrets. No API data. Does not re-print on re-renders within the same tab session.
 */
export function RuffOpsConsoleSignature() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.sessionStorage.getItem(SESSION_KEY) === "1") return;
      window.sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // sessionStorage may be unavailable; still print once per mount in that case
    }

    console.log("%cRUFFOPS", RUFFOPS_CONSOLE_STYLES.wordmark);
    console.log(`%c${RUFFOPS_TAGLINE}`, RUFFOPS_CONSOLE_STYLES.tagline);
    for (const line of RUFFOPS_CONSOLE_LINES) {
      console.log(`%c${line}`, RUFFOPS_CONSOLE_STYLES.line);
    }
  }, []);

  return null;
}
