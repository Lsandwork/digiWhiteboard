import { createClient } from "@supabase/supabase-js";

let browserSupabase: ReturnType<typeof createClient> | null = null;

function isConfigured(value: string | undefined, placeholder: string): value is string {
  return Boolean(value && value !== placeholder && /^https?:\/\//.test(value));
}

export function getBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!isConfigured(url, "https://tzkocaucqtmmnrttxira.supabase.co") || !anonKey || anonKey === "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6a29jYXVjcXRtbW5ydHR4aXJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4NDQzMTMsImV4cCI6MjA5ODQyMDMxM30.FnRbfsz_HXHlPC8T_3oGsOJ1Doj9sbL0nXFbrhl5BjU") {
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
