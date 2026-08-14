import { createClient } from "@supabase/supabase-js";

function isConfigured(value: string | undefined, placeholder: string): value is string {
  return Boolean(value && value !== placeholder && /^https?:\/\//.test(value));
}

type ServiceSupabaseOptions = {
  /**
   * Abort the underlying REST call after this many ms. Promise.race timeouts
   * alone do not stop the fetch, and Vercel will wait on it before sending the
   * HTTP response — that is what makes login/dashboard appear frozen.
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

  const timeoutMs = options.timeoutMs && options.timeoutMs > 0 ? options.timeoutMs : undefined;

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
