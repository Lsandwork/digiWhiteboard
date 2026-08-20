import { after } from "next/server";
import { NextResponse } from "next/server";
import { getOrLoadTtlCache, getTtlCache } from "@/lib/server-ttl-cache";
import { getServiceSupabase } from "@/lib/supabase/server";
import {
  STAFF_IDLE_SLIDESHOW_CACHE_KEY,
  STAFF_IDLE_SLIDESHOW_CACHE_TTL_MS,
  STAFF_IDLE_SLIDESHOW_INTERVAL_MS,
  STAFF_IDLE_SLIDESHOW_LAST_GOOD_KEY,
  formatStaffIdleSlideshowLoadError,
  loadStaffIdleSlideshowSlides,
  storeStaffIdleSlideshowPayload,
  type StaffIdleSlideshowPayload
} from "@/lib/staff/idle-slideshow";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function jsonHeaders(stale = false) {
  return {
    "cache-control": stale
      ? "private, max-age=5, stale-while-revalidate=15"
      : "private, max-age=15, stale-while-revalidate=45"
  };
}

function warmStaffIdleSlideshowCacheInBackground() {
  after(async () => {
    try {
      const slides = await loadStaffIdleSlideshowSlides(getServiceSupabase());
      storeStaffIdleSlideshowPayload(slides);
    } catch (error) {
      console.error("[staff-idle-slideshow] background warm failed:", formatStaffIdleSlideshowLoadError(error));
    }
  });
}

export async function GET() {
  const cachedSlides = getTtlCache<StaffIdleSlideshowPayload["slides"]>(STAFF_IDLE_SLIDESHOW_CACHE_KEY);
  if (cachedSlides !== null) {
    return NextResponse.json(
      { slides: cachedSlides, intervalMs: STAFF_IDLE_SLIDESHOW_INTERVAL_MS, healthy: true },
      { headers: jsonHeaders() }
    );
  }

  const lastGood = getTtlCache<StaffIdleSlideshowPayload>(STAFF_IDLE_SLIDESHOW_LAST_GOOD_KEY);
  if (lastGood?.slides?.length) {
    warmStaffIdleSlideshowCacheInBackground();
    return NextResponse.json(
      { ...lastGood, healthy: false, stale: true },
      { headers: jsonHeaders(true) }
    );
  }

  try {
    const slides = await getOrLoadTtlCache(STAFF_IDLE_SLIDESHOW_CACHE_KEY, STAFF_IDLE_SLIDESHOW_CACHE_TTL_MS, () =>
      loadStaffIdleSlideshowSlides(getServiceSupabase())
    );
    const payload = storeStaffIdleSlideshowPayload(slides);
    return NextResponse.json(payload, { headers: jsonHeaders() });
  } catch (error) {
    const message = formatStaffIdleSlideshowLoadError(error);
    console.error("[staff-idle-slideshow] load failed:", message);
    warmStaffIdleSlideshowCacheInBackground();
    return NextResponse.json(
      {
        slides: [],
        intervalMs: STAFF_IDLE_SLIDESHOW_INTERVAL_MS,
        healthy: false,
        retrying: true,
        error: message
      },
      { status: 200, headers: jsonHeaders(true) }
    );
  }
}
