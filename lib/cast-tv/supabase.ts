import { getServiceSupabase } from "@/lib/supabase/server";

/** CAST-TV reads currently compete with a slow Supabase pool; 8s aborts the library load. */
export const CAST_TV_SUPABASE_TIMEOUT_MS = 30_000;
export const CAST_TV_SUPABASE_UPLOAD_TIMEOUT_MS = 60_000;

export function getCastTvSupabase(timeoutMs = CAST_TV_SUPABASE_TIMEOUT_MS) {
  return getServiceSupabase({ timeoutMs });
}
