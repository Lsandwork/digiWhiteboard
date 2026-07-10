import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { accessFromLegacyRole } from "@/lib/admin/permissions";
import { getRequestUserAccess } from "@/lib/auth/permissions";
import { getServiceSupabase } from "@/lib/supabase/server";
import { resolveWalkBoardActor } from "@/lib/walks-board/actor";
import { summarizeWalkBoardEntries, sortWalkBoardEntries } from "@/lib/walks-board/display";
import {
  addWalkBoardEntry,
  clearWalkBoardEntry,
  listActiveWalkBoardEntries,
  listWalkBoardActivity,
  markWalkBoardWalked,
  resolveWalkBoardPermissions,
  snoozeWalkBoardEntry,
  WalkBoardDuplicateError
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
  const entryId = url.searchParams.get("entryId");

  if (entryId) {
    const activity = await listWalkBoardActivity(supabase, entryId);
    return NextResponse.json({ activity });
  }

  const entries = await listActiveWalkBoardEntries(supabase);
  const nowMs = Date.now();
  const sorted = sortWalkBoardEntries(entries, nowMs);
  const summary = summarizeWalkBoardEntries(entries, nowMs);
  const permissions = await resolveWalkBoardPermissions(
    supabase,
    actor?.actorUserId ?? session.adminUserId,
    session.role,
    session.email
  );

  return NextResponse.json({
    entries: sorted,
    summary,
    permissions,
    serverTime: new Date().toISOString(),
    timezone: "America/Los_Angeles"
  });
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

  const { actorUserId, actorEmail } = actor;
  const access =
    (await getRequestUserAccess(request)) ??
    accessFromLegacyRole(actorUserId, actorEmail, session.role);

  const body = await request.json().catch(() => ({}));
  const action = String(body.action ?? "").trim();

  try {
    if (action === "add") {
      const result = await addWalkBoardEntry(supabase, {
        dogName: String(body.dogName ?? ""),
        walkType: body.walkType,
        actorUserId,
        actorEmail,
        forceDuplicate: body.forceDuplicate === true
      });
      return NextResponse.json({ ok: true, entry: result.entry });
    }

    const entryId = String(body.entryId ?? "").trim();
    if (!entryId) {
      return NextResponse.json({ error: "Missing walk board entry." }, { status: 400 });
    }

    const expectedVersion =
      typeof body.version === "number" && Number.isFinite(body.version) ? body.version : undefined;

    if (action === "mark_walked") {
      const entry = await markWalkBoardWalked(supabase, {
        entryId,
        actorUserId,
        actorEmail,
        expectedVersion
      });
      return NextResponse.json({ ok: true, entry });
    }

    if (action === "snooze") {
      const entry = await snoozeWalkBoardEntry(supabase, {
        entryId,
        actorUserId,
        actorEmail,
        access,
        expectedVersion
      });
      return NextResponse.json({ ok: true, entry });
    }

    if (action === "clear") {
      await clearWalkBoardEntry(supabase, {
        entryId,
        actorUserId,
        actorEmail,
        expectedVersion
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (error) {
    if (error instanceof WalkBoardDuplicateError) {
      return NextResponse.json(
        {
          error: error.message,
          duplicate: error.duplicate
        },
        { status: 409 }
      );
    }

    const message = error instanceof Error ? error.message : "Walks Board request failed.";
    const status =
      message.includes("permission") ? 403 : message.includes("updated by someone else") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
