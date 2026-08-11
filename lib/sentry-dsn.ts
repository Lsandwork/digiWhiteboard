/**
 * Resolve Sentry DSN for client/server/edge init.
 *
 * Prefer env (Vercel Production should set NEXT_PUBLIC_SENTRY_DSN + SENTRY_DSN).
 * Fall back to the public project DSN so client builds never ship with Sentry
 * disabled when env vars were forgotten at build time. Public DSNs are safe
 * to embed in the browser bundle.
 */
export const RUFFOPS_SENTRY_PUBLIC_DSN =
  "https://b44a98908017bb4cb0e13d564eef7408@o4511893516058624.ingest.us.sentry.io/4511893524774912";

export function resolveSentryDsn(
  preferPublicEnv = false
): string | undefined {
  const fromEnv = preferPublicEnv
    ? process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN
    : process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

  const dsn = (fromEnv || RUFFOPS_SENTRY_PUBLIC_DSN).trim();
  return dsn || undefined;
}
