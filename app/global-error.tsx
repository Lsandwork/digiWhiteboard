"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[fitdog-global-error]", error);
    if (typeof window === "undefined") return;

    const guardKey = "fitdog-global-error-reload";
    let alreadyReloaded = false;
    try {
      alreadyReloaded = window.sessionStorage.getItem(guardKey) === "1";
    } catch {
      alreadyReloaded = false;
    }
    if (alreadyReloaded) return;

    const timer = window.setTimeout(() => {
      try {
        window.sessionStorage.setItem(guardKey, "1");
      } catch {
        // Ignore storage failures on locked-down browsers.
      }
      window.location.reload();
    }, 6000);

    return () => window.clearTimeout(timer);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#02060b", color: "white", fontFamily: "system-ui, sans-serif" }}>
        <main
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            padding: "1.5rem",
            textAlign: "center"
          }}
        >
          <div style={{ maxWidth: "28rem" }}>
            <h1 style={{ fontSize: "1.875rem", fontWeight: 900, margin: 0 }}>Reconnecting…</h1>
            <p style={{ marginTop: "0.75rem", color: "#cbd5e1" }}>
              The page recovered from a temporary error and will refresh automatically.
            </p>
            <button
              type="button"
              onClick={() => {
                try {
                  window.sessionStorage.removeItem("fitdog-global-error-reload");
                } catch {
                  // Ignore storage failures.
                }
                reset();
              }}
              style={{
                marginTop: "1.5rem",
                borderRadius: "0.75rem",
                background: "white",
                color: "#020617",
                padding: "0.625rem 1.25rem",
                fontSize: "0.875rem",
                fontWeight: 700,
                border: "none",
                cursor: "pointer"
              }}
            >
              Reload now
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
