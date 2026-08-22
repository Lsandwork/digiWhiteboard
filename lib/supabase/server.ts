import { createClient } from "@supabase/supabase-js";

function isConfigured(value: string | undefined, placeholder: string): value is string {
  return Boolean(value && value !== placeholder && /^https?:\/\//.test(value));
}

/** Interactive admin/staff routes. Abort hung REST so Cloudflare never serves a 522 HTML page. */
export const SERVICE_SUPABASE_TIMEOUT_MS = 8_000;

/**
 * Cron / background jobs. Kept well above interactive reads but far below the
 * old 60s: `service_role` has no server-side statement_timeout, so a query the
 * caller has already abandoned can keep holding its Postgres backend. With
 * minute-by-minute crons that is how the connection pool gets exhausted.
 */
export const SERVICE_SUPABASE_CRON_TIMEOUT_MS = 20_000;

type ServiceSupabaseOptions = {
  /**
   * Abort the underlying REST call after this many ms. Promise.race timeouts
   * alone do not stop the fetch, and Vercel will wait on it before sending the
   * HTTP response — that is what makes login/dashboard appear frozen.
   * Defaults to SERVICE_SUPABASE_TIMEOUT_MS. Pass 0 to disable (do not use on
   * user-facing routes).
   */
  timeoutMs?: number;
};

function fetchWithTimeout(timeoutMs: number): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const parent = init?.signal;
    const onParentAbort = () => controller.abort();
    if (parent) {
      if (parent.aborted) controller.abort();
      else parent.addEventListener("abort", onParentAbort, { once: true });
    }
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
      parent?.removeEventListener("abort", onParentAbort);
    }
  };
}

export function getServiceSupabase(options: ServiceSupabaseOptions = {}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (
    !isConfigured(url, "PASTE_SUPABASE_PROJECT_URL_HERE") ||
    !serviceKey ||
    serviceKey === "PASTE_SUPABASE_SERVICE_ROLE_KEY_HERE"
  ) {
    throw new Error("Supabase server environment variables are not configured.");
  }

  const timeoutMs =
    options.timeoutMs === 0
      ? undefined
      : options.timeoutMs && options.timeoutMs > 0
        ? options.timeoutMs
        : SERVICE_SUPABASE_TIMEOUT_MS;

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    },
    ...(timeoutMs
      ? {
          global: {
            fetch: fetchWithTimeout(timeoutMs)
          }
        }
      : {})
  });
}
