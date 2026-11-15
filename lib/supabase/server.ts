import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL_PLACEHOLDER = "PASTE_SUPABASE_PROJECT_URL_HERE";
const SUPABASE_SERVICE_PLACEHOLDER = "PASTE_SUPABASE_SERVICE_ROLE_KEY_HERE";

function normalizeSupabaseProjectUrl(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  if (!value || value === SUPABASE_URL_PLACEHOLDER) return undefined;
  if (/^https?:\/\//i.test(value)) return value.replace(/\/$/, "");
  if (/^[a-z0-9-]+\.supabase\.co$/i.test(value)) return `https://${value}`;
  return undefined;
}

export function resolveSupabaseProjectUrl(): string | undefined {
  return (
    normalizeSupabaseProjectUrl(process.env.NEXT_PUBLIC_SUPABASE_URL) ??
    normalizeSupabaseProjectUrl(process.env.SUPABASE_URL)
  );
}

function resolveSupabaseServiceRoleKey(): string | undefined {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key || key === SUPABASE_SERVICE_PLACEHOLDER) return undefined;
  return key;
}

/** Safe summary for 503 responses and health panels — never includes secrets. */
export function getSupabaseServerConfigSummary() {
  const url = resolveSupabaseProjectUrl();
  let urlHost: string | null = null;
  if (url) {
    try {
      urlHost = new URL(url).host;
    } catch {
      urlHost = null;
    }
  }
  const rawPublic = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const rawAlt = process.env.SUPABASE_URL?.trim();
  return {
    hasProjectUrl: Boolean(url),
    hasServiceRoleKey: Boolean(resolveSupabaseServiceRoleKey()),
    urlHost,
    publicUrlLooksConfigured: Boolean(rawPublic && rawPublic !== SUPABASE_URL_PLACEHOLDER),
    publicUrlLooksValid: Boolean(normalizeSupabaseProjectUrl(rawPublic)),
    hasAlternateSupabaseUrl: Boolean(rawAlt && rawAlt !== SUPABASE_URL_PLACEHOLDER)
  };
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

/** Returns null when URL/service key are missing or still placeholders (env login must not brick the UI). */
export function tryGetServiceSupabase(options: ServiceSupabaseOptions = {}) {
  try {
    return getServiceSupabase(options);
  } catch {
    return null;
  }
}

export function getServiceSupabase(options: ServiceSupabaseOptions = {}) {
  const url = resolveSupabaseProjectUrl();
  const serviceKey = resolveSupabaseServiceRoleKey();

  if (!url || !serviceKey) {
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
