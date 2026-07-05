import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import type { DemoPushAction } from "@/lib/demo/constants";
import { isDemoSession } from "@/lib/demo/session";
import { applyDemoPush, demoSandboxToBoard } from "@/lib/demo/store";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const session = getAdminSessionFromRequest(request);
  if (!isDemoSession(session)) {
    return NextResponse.json({ error: "Demo push is only available for the demo account." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as { action?: string; dog_name?: string };
    const action = String(body.action ?? "") as DemoPushAction;
    if (!["check_in", "check_out", "grooming"].includes(action)) {
      return NextResponse.json({ error: "Unsupported demo action." }, { status: 400 });
    }

    const supabase = getServiceSupabase();
    const sandbox = await applyDemoPush(
      supabase,
      action,
      String(body.dog_name ?? "Max Smith"),
      session?.email ?? "demo"
    );

    return NextResponse.json({
      ok: true,
      action,
      board: demoSandboxToBoard(sandbox),
      stats: sandbox.stats
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to run demo push.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
