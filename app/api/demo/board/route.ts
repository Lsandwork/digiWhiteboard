import { NextResponse } from "next/server";
import { demoSandboxToBoard, getDemoSandbox } from "@/lib/demo/store";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = getServiceSupabase();
    const sandbox = await getDemoSandbox(supabase);
    return NextResponse.json({
      ...demoSandboxToBoard(sandbox),
      stats: sandbox.stats,
      demo: true
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load demo board.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
