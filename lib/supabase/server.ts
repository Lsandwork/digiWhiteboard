import { createClient } from "@supabase/supabase-js";

function isConfigured(value: string | undefined, placeholder: string): value is string {
  return Boolean(value && value !== placeholder && /^https?:\/\//.test(value));
}

export function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (
    !isConfigured(url, "PASTE_SUPABASE_PROJECT_URL_HERE") ||
    !serviceKey ||
    serviceKey === "PASTE_SUPABASE_SERVICE_ROLE_KEY_HERE"
  ) {
    throw new Error("Supabase server environment variables are not configured.");
  }

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}
