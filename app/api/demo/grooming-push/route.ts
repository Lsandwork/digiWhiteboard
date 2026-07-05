import { NextResponse } from "next/server";
import { getDemoSandbox } from "@/lib/demo/store";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = getServiceSupabase();
    const sandbox = await getDemoSandbox(supabase);
    const now = Date.now();
    const active = sandbox.grooming_notices.filter(
      (notice) => notice.status === "active" && new Date(notice.expires_at).getTime() > now
    );
    const queue = active.slice(1);
    return NextResponse.json({
      activeNotice: active[0] ?? null,
      queue,
      demo: true
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load demo grooming notices.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
