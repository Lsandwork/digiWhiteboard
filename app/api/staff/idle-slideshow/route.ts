import { NextResponse } from "next/server";
import { getOrLoadTtlCache, getTtlCache, setTtlCache } from "@/lib/server-ttl-cache";
import { getServiceSupabase } from "@/lib/supabase/server";
import {
  STAFF_IDLE_SLIDESHOW_CACHE_KEY,
  STAFF_IDLE_SLIDESHOW_CACHE_TTL_MS,
  STAFF_IDLE_SLIDESHOW_INTERVAL_MS,
  STAFF_IDLE_SLIDESHOW_LAST_GOOD_KEY,
  STAFF_IDLE_SLIDESHOW_LAST_GOOD_TTL_MS,
  STAFF_IDLE_SLIDESHOW_LOAD_TIMEOUT_MS,
  formatStaffIdleSlideshowLoadError,
  loadStaffIdleSlideshowSlides,
  type StaffIdleSlideshowPayload
} from "@/lib/staff/idle-slideshow";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const slides = await getOrLoadTtlCache(STAFF_IDLE_SLIDESHOW_CACHE_KEY, STAFF_IDLE_SLIDESHOW_CACHE_TTL_MS, () =>
      loadStaffIdleSlideshowSlides(getServiceSupabase({ timeoutMs: STAFF_IDLE_SLIDESHOW_LOAD_TIMEOUT_MS }))
    );
    const payload: StaffIdleSlideshowPayload = {
      slides,
      intervalMs: STAFF_IDLE_SLIDESHOW_INTERVAL_MS,
      healthy: true
    };
    setTtlCache(STAFF_IDLE_SLIDESHOW_LAST_GOOD_KEY, payload, STAFF_IDLE_SLIDESHOW_LAST_GOOD_TTL_MS);
    return NextResponse.json(payload, {
      headers: {
        "cache-control": "private, max-age=15, stale-while-revalidate=45"
      }
    });
  } catch (error) {
    const message = formatStaffIdleSlideshowLoadError(error);
    console.error("[staff-idle-slideshow] load failed:", message);
    const lastGood = getTtlCache<StaffIdleSlideshowPayload>(STAFF_IDLE_SLIDESHOW_LAST_GOOD_KEY);
    if (lastGood?.slides?.length) {
      return NextResponse.json(
        {
          ...lastGood,
          healthy: false,
          stale: true,
          error: message
        },
        {
          status: 200,
          headers: {
            "cache-control": "private, max-age=5, stale-while-revalidate=15"
          }
        }
      );
    }
    return NextResponse.json(
      { slides: [], intervalMs: STAFF_IDLE_SLIDESHOW_INTERVAL_MS, healthy: false, error: message },
      {
        status: 200,
        headers: {
          "cache-control": "private, max-age=5, stale-while-revalidate=15"
        }
      }
    );
  }
}
