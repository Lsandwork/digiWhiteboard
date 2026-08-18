import type { DisplayType } from "@/lib/display-keeper";
import { queueHardRefreshForKnownDisplays } from "@/lib/display-keeper-server";
import { bumpCastHardReloadNonce } from "@/lib/display-sync-server";

const CAST_REFRESH_BOARDS: DisplayType[] = ["staff_whiteboard", "lobby_whiteboard"];

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

/**
 * Admin Refresh and Hard Refresh Cast TVs both use this.
 * Bumps the live nonce every staff/lobby TV polls, and queues per-device
 * hard_refresh commands so Cast Keeper TVs reload even if they miss the nonce.
 */
export async function signalCastDisplaysHardRefresh(supabase: SupabaseClient) {
  const nonce = await bumpCastHardReloadNonce(supabase);
  await queueHardRefreshForKnownDisplays(supabase, CAST_REFRESH_BOARDS, {
    reason: "admin_cast_refresh",
    cast_hard_reload_nonce: nonce
  });
  return nonce;
}
