import * as Sentry from "@sentry/nextjs";
import { resolveSentryDsn } from "./lib/sentry-dsn";

const dsn = resolveSentryDsn(true);

Sentry.init({
  dsn: dsn || undefined,
  enabled: Boolean(dsn),
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
  release:
    process.env.SENTRY_RELEASE ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_BUILD_ID ||
    undefined,

  // 100% in development, 10% in production
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Session Replay: 10% of sessions, 100% of sessions with errors
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  enableLogs: true,

  integrations: [Sentry.replayIntegration()],
});

// Hook into App Router navigation transitions
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
