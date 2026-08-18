import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { accessFromLegacyRole } from "@/lib/admin/permissions";
import { getRequestUserAccess } from "@/lib/auth/permissions";
import { getServiceSupabase } from "@/lib/supabase/server";
import { resolveWalkBoardActor } from "@/lib/walks-board/actor";
import {
  listWalkBoardActivity,
  loadWalkBoardPublicState,
  markWalkBoardCycleComplete
} from "@/lib/walks-board/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const session = getAdminSessionFromRequest(request);
  if (!session?.email) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = getServiceSupabase();
  const actor = await resolveWalkBoardActor(supabase, session);
  const url = new URL(request.url);
  const cycleId = url.searchParams.get("cycleId") ?? url.searchParams.get("entryId");
  const noStore = { "Cache-Control": "private, no-store, max-age=0" };

  if (cycleId) {
    const activity = await listWalkBoardActivity(supabase, cycleId);
    return NextResponse.json({ activity }, { headers: noStore });
  }

  const state = await loadWalkBoardPublicState(supabase, {
    userId: actor?.actorUserId ?? session.adminUserId,
    legacyRole: session.role,
    email: session.email
  });

  return NextResponse.json(state, { headers: noStore });
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const session = getAdminSessionFromRequest(request);
  if (!session?.email) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = getServiceSupabase();
  const actor = await resolveWalkBoardActor(supabase, session);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const access =
    (await getRequestUserAccess(request)) ??
    accessFromLegacyRole(actor.actorUserId, actor.actorEmail, session.role);

  const body = await request.json().catch(() => ({}));
  const action = String(body.action ?? "").trim();

  if (action === "snooze" || action === "add" || action === "clear") {
    return NextResponse.json(
      { error: "Walks Board alarms cannot be snoozed or edited. Mark the current cycle complete." },
      { status: 400 }
    );
  }

  try {
    if (action === "complete" || action === "mark_walked") {
      const cycleId = String(body.cycleId ?? body.entryId ?? "").trim();
      if (!cycleId) {
        return NextResponse.json({ error: "Missing Walks Board alarm." }, { status: 400 });
      }
      const expectedVersion =
        typeof body.version === "number" && Number.isFinite(body.version) ? body.version : undefined;
      const cycle = await markWalkBoardCycleComplete(supabase, {
        cycleId,
        actorUserId: actor.actorUserId,
        actorEmail: actor.actorEmail,
        access,
        expectedVersion
      });
      return NextResponse.json({ ok: true, cycle });
    }

    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Walks Board request failed.";
    const status =
      message.includes("permission") ? 403 : message.includes("updated by someone else") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
