import type { DisplayType } from "@/lib/display-keeper";
import { queueHardRefreshForKnownDisplays } from "@/lib/display-keeper-server";
import { bumpCastHardReloadNonce } from "@/lib/display-sync-server";
import { refreshPairedRemoteCastDisplays } from "@/lib/remote-cast/server";

const CAST_REFRESH_BOARDS: DisplayType[] = ["staff_whiteboard", "lobby_whiteboard"];

/** Admin Refresh must still return if device-queue / remote-cast Postgres hangs. */
export const CAST_REFRESH_SIGNAL_TIMEOUT_MS = 6_000;

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

/**
 * Admin Refresh and Hard Refresh Cast TVs both use this.
 * 1) Bump the live nonce board pages poll (Storage, not hanging admin_settings).
 * 2) Queue Cast Keeper hard_refresh commands (best-effort, do not block the admin button).
 * 3) Send REFRESH to every paired Remote Whiteboard Cast TV app (best-effort).
 */
export async function signalCastDisplaysHardRefresh(supabase: SupabaseClient) {
  const nonce = await bumpCastHardReloadNonce(supabase);

  void queueHardRefreshForKnownDisplays(supabase, CAST_REFRESH_BOARDS, {
    reason: "admin_cast_refresh",
    cast_hard_reload_nonce: nonce
  }).catch((error) => {
    console.error("[cast-refresh] display command queue failed:", error);
  });

  void refreshPairedRemoteCastDisplays(supabase).catch((error) => {
    console.error("[cast-refresh] remote cast refresh failed:", error);
  });

  return { nonce, remoteCastRefreshed: 0 };
}
