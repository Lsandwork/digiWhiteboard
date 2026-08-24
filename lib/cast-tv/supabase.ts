import { getServiceSupabase } from "@/lib/supabase/server";

/** Storage JSON/object calls should finish quickly; 15s leaves headroom without a 20s hang. */
export const CAST_TV_SUPABASE_TIMEOUT_MS = 15_000;
export const CAST_TV_SUPABASE_UPLOAD_TIMEOUT_MS = 60_000;

export function getCastTvSupabase(timeoutMs = CAST_TV_SUPABASE_TIMEOUT_MS) {
  return getServiceSupabase({ timeoutMs });
}
