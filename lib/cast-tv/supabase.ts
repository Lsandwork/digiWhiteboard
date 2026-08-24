import { getServiceSupabase } from "@/lib/supabase/server";

/** admin_settings JSON reads complete in a few seconds; 20s leaves headroom. */
export const CAST_TV_SUPABASE_TIMEOUT_MS = 20_000;
export const CAST_TV_SUPABASE_UPLOAD_TIMEOUT_MS = 60_000;

export function getCastTvSupabase(timeoutMs = CAST_TV_SUPABASE_TIMEOUT_MS) {
  return getServiceSupabase({ timeoutMs });
}
