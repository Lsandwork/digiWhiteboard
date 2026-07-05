import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { isDemoSession } from "@/lib/demo/session";
import { resetDemoSandbox } from "@/lib/demo/store";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  const session = getAdminSessionFromRequest(request);
  if (!isDemoSession(session)) {
    return NextResponse.json({ error: "Demo reset is only available for the demo account." }, { status: 403 });
  }

  try {
    const supabase = getServiceSupabase();
    const sandbox = await resetDemoSandbox(supabase);
    return NextResponse.json({ ok: true, stats: sandbox.stats });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to reset demo sandbox.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
