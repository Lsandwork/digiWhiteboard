import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import {
  STAFF_IDLE_SLIDESHOW_INTERVAL_MS,
  loadStaffIdleSlideshowSlides
} from "@/lib/staff/idle-slideshow";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const slides = await loadStaffIdleSlideshowSlides(getServiceSupabase());
    return NextResponse.json(
      { slides, intervalMs: STAFF_IDLE_SLIDESHOW_INTERVAL_MS },
      {
        headers: {
          "cache-control": "private, max-age=30, stale-while-revalidate=60"
        }
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load media library slideshow.";
    return NextResponse.json(
      { slides: [], intervalMs: STAFF_IDLE_SLIDESHOW_INTERVAL_MS, error: message },
      { status: 200 }
    );
  }
}
