import { NextResponse } from "next/server";
import { loadGroomingPushBoardState } from "@/lib/staff/grooming-push-notices";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = getServiceSupabase();
    const state = await loadGroomingPushBoardState(supabase);
    return NextResponse.json({ ...state, healthy: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load grooming push notices.";
    return NextResponse.json({ activeNotice: null, queue: [], healthy: false, error: message }, { status: 500 });
  }
}
