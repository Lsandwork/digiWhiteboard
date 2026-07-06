import { NextResponse } from "next/server";
import { getDemoSandbox } from "@/lib/demo/store";
import { demoStaffPushBoardState } from "@/lib/demo/staff-push";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = getServiceSupabase();
    const sandbox = await getDemoSandbox(supabase);
    return NextResponse.json({ ...demoStaffPushBoardState(sandbox), demo: true, healthy: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load demo push notices.";
    return NextResponse.json({ activeNotice: null, healthy: false, error: message }, { status: 500 });
  }
}
