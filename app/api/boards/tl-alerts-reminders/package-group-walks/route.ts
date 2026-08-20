import { NextResponse } from "next/server";
import { getOrLoadTtlCache } from "@/lib/server-ttl-cache";
import { getServiceSupabase } from "@/lib/supabase/server";
import { loadCompletedPackageGroupWalkAnimalIds } from "@/lib/package-group-walks/tl-board";
import { packageGroupWalkBusinessDate } from "@/lib/package-group-walks/store";

export const dynamic = "force-dynamic";

/** Multiple TVs polling at the same time share one indexed query. */
const PULSE_CACHE_TTL_MS = 2_000;

/**
 * Completion pulse for the Team Lead TV.
 *
 * The full board payload refreshes on the Gingr cadence; this returns only the
 * Gingr animal ids already walked today so the whiteboard can drop a dog within
 * seconds of anyone completing it. No names, no secrets — same trust level as the
 * public board endpoint it accompanies.
 */
export async function GET() {
  const businessDate = packageGroupWalkBusinessDate();
  try {
    const payload = await getOrLoadTtlCache(
      `tl-board:package-group-walk-pulse:${businessDate}`,
      PULSE_CACHE_TTL_MS,
      async () => {
        const supabase = getServiceSupabase({ timeoutMs: 2_500 });
        return loadCompletedPackageGroupWalkAnimalIds(supabase);
      }
    );
    return NextResponse.json(
      { ...payload, ok: true, generatedAt: new Date().toISOString() },
      { headers: { "cache-control": "private, no-store, max-age=0" } }
    );
  } catch (error) {
    // Never assert "nothing completed" from a failed read — the TV keeps its rows.
    return NextResponse.json(
      {
        businessDate,
        completedAnimalIds: [],
        ok: false,
        error: error instanceof Error ? error.message : "Package Group Walk pulse failed.",
        generatedAt: new Date().toISOString()
      },
      { status: 200, headers: { "cache-control": "private, no-store, max-age=0" } }
    );
  }
}
