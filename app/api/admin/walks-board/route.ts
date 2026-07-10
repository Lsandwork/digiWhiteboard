import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { normalizeAdminUserId } from "@/lib/admin/users";
import { getRequestUserAccess } from "@/lib/auth/permissions";
import { hasPermission } from "@/lib/admin/permissions";
import { getServiceSupabase } from "@/lib/supabase/server";
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

function forbiddenResponse(message = "You do not have permission to access the Walks Board.") {
  return NextResponse.json({ error: message }, { status: 403 });
}

function actorFromRequest(request: Request) {
  const session = getAdminSessionFromRequest(request);
  return {
    session,
    actorUserId: normalizeAdminUserId(session?.adminUserId),
    actorEmail: session?.email ?? null
  };
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const { session } = actorFromRequest(request);
  const access = await getRequestUserAccess(request);
  if (!hasPermission(access, "view_admin_panel")) return forbiddenResponse();

  const supabase = getServiceSupabase();
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
    session?.adminUserId,
    session?.role,
    session?.email
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

  const { session, actorUserId, actorEmail } = actorFromRequest(request);
  if (!actorUserId) {
    return NextResponse.json({ error: "Signed-in staff account required." }, { status: 401 });
  }

  const access = await getRequestUserAccess(request);
  if (!hasPermission(access, "view_admin_panel")) return forbiddenResponse();

  const body = await request.json().catch(() => ({}));
  const action = String(body.action ?? "").trim();
  const supabase = getServiceSupabase();

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
        access: access!,
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
