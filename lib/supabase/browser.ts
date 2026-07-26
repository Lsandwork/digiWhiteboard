import { createClient } from "@supabase/supabase-js";

let browserSupabase: ReturnType<typeof createClient> | null = null;

function isConfiguredUrl(value: string | undefined): value is string {
  const trimmed = value?.trim();
  if (!trimmed) return false;
  if (trimmed.includes("PASTE_") || trimmed.includes("YOUR_")) return false;
  return /^https?:\/\//.test(trimmed);
}

function isConfiguredAnonKey(value: string | undefined): value is string {
  const trimmed = value?.trim();
  if (!trimmed) return false;
  if (trimmed.includes("PASTE_") || trimmed.includes("YOUR_")) return false;
  // Real Supabase anon JWTs are three base64url segments.
  return trimmed.split(".").length === 3 && trimmed.length > 40;
}

export function getBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!isConfiguredUrl(url) || !isConfiguredAnonKey(anonKey)) {
    return null;
  }

  if (!browserSupabase) {
    try {
      browserSupabase = createClient(url, anonKey);
    } catch {
      return null;
    }
  }

  return browserSupabase;
}
