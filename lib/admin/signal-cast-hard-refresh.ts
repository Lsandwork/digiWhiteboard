import type { DisplayType } from "@/lib/display-keeper";
import { queueHardRefreshForKnownDisplays } from "@/lib/display-keeper-server";
import { bumpCastHardReloadNonce } from "@/lib/display-sync-server";
import { refreshPairedRemoteCastDisplays } from "@/lib/remote-cast/server";

const CAST_REFRESH_BOARDS: DisplayType[] = ["staff_whiteboard", "lobby_whiteboard"];

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

/**
 * Admin Refresh and Hard Refresh Cast TVs both use this.
 * 1) Bump the live nonce board pages poll.
 * 2) Queue Cast Keeper hard_refresh commands.
 * 3) Send REFRESH to every paired Remote Whiteboard Cast TV app (lobby + staff).
 */
export async function signalCastDisplaysHardRefresh(supabase: SupabaseClient) {
  const nonce = await bumpCastHardReloadNonce(supabase);
  await queueHardRefreshForKnownDisplays(supabase, CAST_REFRESH_BOARDS, {
    reason: "admin_cast_refresh",
    cast_hard_reload_nonce: nonce
  });

  let remoteCastRefreshed = 0;
  try {
    remoteCastRefreshed = (await refreshPairedRemoteCastDisplays(supabase)).refreshed;
  } catch (error) {
    console.error("[cast-refresh] remote cast refresh failed:", error);
  }

  return { nonce, remoteCastRefreshed };
}
