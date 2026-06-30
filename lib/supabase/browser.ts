import { createClient } from "@supabase/supabase-js";

function isConfigured(value: string | undefined, placeholder: string): value is string {
  return Boolean(value && value !== placeholder && /^https?:\/\//.test(value));
}

export function getBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!isConfigured(url, "PASTE_SUPABASE_PROJECT_URL_HERE") || !anonKey || anonKey === "PASTE_SUPABASE_ANON_KEY_HERE") {
    return null;
  }

  return createClient(url, anonKey);
}
