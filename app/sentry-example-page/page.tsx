"use client";

/**
 * Temporary Sentry verification page (classic undefined-function trigger).
 * DELETE after confirming the issue appears in Sentry Issues.
 *
 * Open: /sentry-example-page
 */
export default function SentryExamplePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "1.5rem",
        background: "#02060b",
        color: "white",
        fontFamily: "system-ui, sans-serif"
      }}
    >
      <div style={{ maxWidth: "32rem", textAlign: "center" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 800, margin: 0 }}>Sentry example</h1>
        <p style={{ marginTop: "0.75rem", color: "#94a3b8", lineHeight: 1.5 }}>
          Click the button to call <code>myUndefinedFunction()</code> and send a client-side
          error to Sentry. Remove this page after verification.
        </p>
        <button
          type="button"
          onClick={() => {
            // Classic Sentry docs trigger — intentional ReferenceError (do not catch)
            // @ts-expect-error intentional undefined call for Sentry verification
            myUndefinedFunction();
          }}
          style={{
            marginTop: "1.5rem",
            borderRadius: "0.75rem",
            background: "#f97316",
            color: "#0f172a",
            padding: "0.75rem 1.25rem",
            fontSize: "0.95rem",
            fontWeight: 700,
            border: "none",
            cursor: "pointer"
          }}
        >
          Break the world
        </button>
      </div>
    </main>
  );
}
