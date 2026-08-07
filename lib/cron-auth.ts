/**
 * Shared auth for Vercel cron / scheduled job routes.
 *
 * When CRON_SECRET is set (required in production), only
 * `Authorization: Bearer ${CRON_SECRET}` is accepted.
 * Never trust `x-vercel-cron` alone — that header is client-spoofable.
 *
 * Vercel Cron automatically sends the Bearer header when CRON_SECRET is configured.
 */
export function isAuthorizedCron(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret) {
    const auth = request.headers.get("authorization")?.trim();
    return auth === `Bearer ${cronSecret}`;
  }

  // Fail closed in production / Vercel production when secret is missing.
  const vercelEnv = process.env.VERCEL_ENV?.trim();
  if (process.env.NODE_ENV === "production" || vercelEnv === "production") {
    return false;
  }

  // Local/dev only: allow Vercel's cron header for convenience.
  return request.headers.get("x-vercel-cron") === "1";
}
