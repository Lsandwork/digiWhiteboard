import { NextResponse } from "next/server";
import { requireBodyCheckAccess } from "@/lib/body-checks/access";
import { getBodyCheckReport, updateFollowUp } from "@/lib/body-checks/store";
import { FOLLOW_UP_STATUSES, type FollowUpStatus } from "@/lib/body-checks/types";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const gate = await requireBodyCheckAccess(request);
  if (gate.error || !gate.supabase) return gate.error;
  const { id } = await context.params;
  try {
    const result = await getBodyCheckReport(gate.supabase, id);
    if (!result) return NextResponse.json({ error: "Report not found." }, { status: 404 });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load the report.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const gate = await requireBodyCheckAccess(request);
  if (gate.error || !gate.supabase || !gate.actor) return gate.error;
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { followUpStatus?: string; note?: string } | null;
  const next = body?.followUpStatus;
  if (!next || !(FOLLOW_UP_STATUSES as readonly string[]).includes(next)) {
    return NextResponse.json({ error: "Choose a follow-up status. Submitted findings stay unchanged." }, { status: 400 });
  }
  try {
    const report = await updateFollowUp(gate.supabase, id, next as FollowUpStatus, gate.actor, body?.note);
    return NextResponse.json({ report });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update follow-up.";
    const status = /not found/i.test(message) ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
