import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn: dsn || undefined,
  enabled: Boolean(dsn),
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
  release:
    process.env.SENTRY_RELEASE ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_BUILD_ID ||
    undefined,

  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Attach local variable values to stack frames (server only)
  includeLocalVariables: true,

  enableLogs: true,
});
