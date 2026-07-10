import { NextResponse } from "next/server";
import { getOrLoadTtlCache, getTtlCache, setTtlCache } from "@/lib/server-ttl-cache";
import { BOARD_OVERLAY_CACHE_TTL_MS } from "@/lib/board-settings-cache";
import { loadGroomingPushBoardState } from "@/lib/staff/grooming-push-notices";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const LAST_GOOD_KEY = "grooming-push:last-good";

export async function GET() {
  try {
    const state = await getOrLoadTtlCache("grooming-push:board", BOARD_OVERLAY_CACHE_TTL_MS, () =>
      loadGroomingPushBoardState(getServiceSupabase(), { mutate: false })
    );
    const payload = { ...state, healthy: true };
    setTtlCache(LAST_GOOD_KEY, payload, 120_000);
    return NextResponse.json(payload, {
      headers: { "cache-control": "private, max-age=2, stale-while-revalidate=8" }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load grooming push notices.";
    const lastGood = getTtlCache<Record<string, unknown>>(LAST_GOOD_KEY);
    if (lastGood) {
      return NextResponse.json({ ...lastGood, healthy: false, stale: true, error: message });
    }
    return NextResponse.json({ activeNotice: null, queue: [], healthy: false, error: message }, { status: 500 });
  }
}
