import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { loadAdminSettings } from "@/lib/admin/settings";
import { loadActiveDogsForGroomingPush } from "@/lib/grooming-push-active-dogs";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  try {
    const supabase = getServiceSupabase();
    const settings = await loadAdminSettings(supabase);
    const result = await loadActiveDogsForGroomingPush(supabase, { timeZone: settings.timezone });

    return NextResponse.json({
      dogs: result.dogs,
      meta: result.meta,
      healthy: true
    });
  } catch (error) {
    console.error("[grooming-push] active dogs load failed:", error);
    return NextResponse.json(
      {
        dogs: [],
        healthy: false,
        error: "Unable to load dogs from Gingr right now. Try again in a moment."
      },
      { status: 500 }
    );
  }
}
