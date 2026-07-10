import { NextResponse } from "next/server";
import { getOrLoadTtlCache, getTtlCache, setTtlCache } from "@/lib/server-ttl-cache";
import { BOARD_OVERLAY_CACHE_TTL_MS } from "@/lib/board-settings-cache";
import { loadCastVideoBoardState } from "@/lib/staff/cast-video-notices";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const department = searchParams.get("department") ?? "staff_whiteboard";
  const emergencyOnly = searchParams.get("emergency") === "1";
  const cacheKey = `cast-videos:${department}:${emergencyOnly ? "emergency" : "regular"}`;
  const lastGoodKey = `${cacheKey}:last-good`;

  try {
    const state = await getOrLoadTtlCache(cacheKey, BOARD_OVERLAY_CACHE_TTL_MS, () =>
      loadCastVideoBoardState(getServiceSupabase(), { department, emergencyOnly, mutate: false })
    );
    const payload = { ...state, healthy: true };
    setTtlCache(lastGoodKey, payload, 120_000);
    return NextResponse.json(payload, {
      headers: { "cache-control": "private, max-age=2, stale-while-revalidate=8" }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load cast videos.";
    const lastGood = getTtlCache<Record<string, unknown>>(lastGoodKey);
    if (lastGood) {
      return NextResponse.json({ ...lastGood, healthy: false, stale: true, error: message });
    }
    return NextResponse.json({ activeNotice: null, queue: [], healthy: false, error: message }, { status: 500 });
  }
}
