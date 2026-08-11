import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { loadAdminSettings } from "@/lib/admin/settings";
import { loadActiveDogsForGroomingPush } from "@/lib/grooming-push-active-dogs";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const url = new URL(request.url);
  const forceRefresh =
    url.searchParams.get("fresh") === "1" ||
    url.searchParams.get("sync") === "1" ||
    url.searchParams.get("force") === "1";

  try {
    const supabase = getServiceSupabase();
    const settings = await loadAdminSettings(supabase);
    const result = await loadActiveDogsForGroomingPush(supabase, {
      timeZone: settings.timezone || "America/Los_Angeles",
      forceRefresh
    });

    return NextResponse.json({
      dogs: result.dogs,
      meta: result.meta,
      healthy: !result.meta.checked_in_fetch_error,
      error: result.meta.checked_in_fetch_error ? String(result.meta.checked_in_fetch_error) : null
    });
  } catch (error) {
    console.error("[grooming-push] active dogs load failed:", error);
    const message =
      error instanceof Error
        ? error.message
        : "Unable to load dogs from Gingr right now. Try again in a moment.";
    return NextResponse.json(
      {
        dogs: [],
        healthy: false,
        error: message,
        meta: { force_refresh: forceRefresh }
      },
      { status: 502 }
    );
  }
}
