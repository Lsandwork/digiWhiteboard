import { NextResponse } from "next/server";
import { loadCastVideoBoardState } from "@/lib/staff/cast-video-notices";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const department = searchParams.get("department") ?? "staff_whiteboard";
    const emergencyOnly = searchParams.get("emergency") === "1";

    const supabase = getServiceSupabase();
    const state = await loadCastVideoBoardState(supabase, { department, emergencyOnly });
    return NextResponse.json({ ...state, healthy: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load cast videos.";
    return NextResponse.json({ activeNotice: null, queue: [], healthy: false, error: message }, { status: 500 });
  }
}
