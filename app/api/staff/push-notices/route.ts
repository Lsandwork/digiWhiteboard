import { NextResponse } from "next/server";
import { getOrLoadTtlCache } from "@/lib/server-ttl-cache";
import { BOARD_OVERLAY_CACHE_TTL_MS } from "@/lib/board-settings-cache";
import { loadActiveStaffPushNotice } from "@/lib/staff/push-notices";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const activeNotice = await getOrLoadTtlCache("staff-push-active", BOARD_OVERLAY_CACHE_TTL_MS, async () => {
      const supabase = getServiceSupabase();
      return loadActiveStaffPushNotice(supabase, { mutate: false });
    });
    return NextResponse.json(
      { activeNotice, healthy: true },
      { headers: { "cache-control": "private, max-age=2, stale-while-revalidate=8" } }
    );
  } catch {
    return NextResponse.json({ activeNotice: null, healthy: false });
  }
}
