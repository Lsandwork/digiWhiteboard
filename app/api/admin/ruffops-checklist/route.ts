import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { canAccessAdminTab, accessFromLegacyRole } from "@/lib/admin/permissions";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { normalizeAdminUserId } from "@/lib/admin/users";
import { parseChecklistItemKey, sourceForParsedKey, sourceIdForParsedKey } from "@/lib/ruffops-checklist/keys";
import {
  undoChecklistCompletion,
  upsertChecklistCompletion
} from "@/lib/ruffops-checklist/completions";
import { loadRuffopsChecklistState } from "@/lib/ruffops-checklist/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { resolveWalkBoardActor } from "@/lib/walks-board/actor";
import { markWalkBoardCycleComplete } from "@/lib/walks-board/server";

export const dynamic = "force-dynamic";

async function actorDisplayName(
  supabase: ReturnType<typeof getServiceSupabase>,
  userId: string | null,
  email: string | null
) {
  if (userId) {
    const { data } = await supabase.from("admin_users").select("full_name, email").eq("id", userId).maybeSingle();
    const name = String(data?.full_name ?? "").trim();
    if (name) return name;
    const userEmail = String(data?.email ?? "").trim();
    if (userEmail) return userEmail;
  }
  return email?.trim() || "Staff";
}

async function requireChecklistAccess(request: Request) {
  if (!isAdminRequest(request)) return { error: unauthorizedAdminResponse() };
  const session = getAdminSessionFromRequest(request);
  if (!session?.email) {
    return { error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };
  }
  const access = accessFromLegacyRole(session.adminUserId ?? null, session.email, session.role);
  if (!canAccessAdminTab(access, "ruffops_checklist", session.role, "staff")) {
    return { error: NextResponse.json({ error: "You do not have access to the RuffOps Checklist." }, { status: 403 }) };
  }
  return { session, access };
}

export async function GET(request: Request) {
  const gate = await requireChecklistAccess(request);
  if (gate.error) return gate.error;

  try {
    const supabase = getServiceSupabase({ timeoutMs: 8_000 });
    const state = await loadRuffopsChecklistState(supabase, {
      userId: gate.session.adminUserId,
      legacyRole: gate.session.role,
      email: gate.session.email
    });
    return NextResponse.json(state);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load RuffOps Checklist.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const gate = await requireChecklistAccess(request);
  if (gate.error) return gate.error;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const itemKey = String(body.item_key ?? body.itemKey ?? "").trim();
  const completed = body.completed !== false && body.completed !== "false";
  const parsed = parseChecklistItemKey(itemKey);
  if (!parsed) {
    return NextResponse.json({ error: "Unknown checklist item." }, { status: 400 });
  }

  const supabase = getServiceSupabase({ timeoutMs: 8_000 });
  const actorUserId = normalizeAdminUserId(gate.session.adminUserId);

  try {
    const current = await loadRuffopsChecklistState(supabase, {
      userId: actorUserId,
      legacyRole: gate.session.role,
      email: gate.session.email
    });
    const item = current.items.find((row) => row.key === itemKey);
    if (!item) {
      return NextResponse.json({ error: "That checklist item is no longer on today's list." }, { status: 404 });
    }
    if (!item.canToggle) {
      return NextResponse.json(
        { error: item.checkboxLocked ? "This item is already recorded and cannot be unchecked here." : "This item cannot be updated." },
        { status: 400 }
      );
    }

    if (parsed.kind === "walks") {
      if (!completed) {
        return NextResponse.json({ error: "Walks Board alarms cannot be unchecked." }, { status: 400 });
      }
      const actor = await resolveWalkBoardActor(supabase, gate.session);
      if (!actor) {
        return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
      }
      await markWalkBoardCycleComplete(supabase, {
        cycleId: parsed.cycleId,
        actorUserId: actor.actorUserId,
        actorEmail: actor.actorEmail,
        access: gate.access
      });
    } else if (completed) {
      const name = await actorDisplayName(supabase, actorUserId, gate.session.email);
      await upsertChecklistCompletion(supabase, {
        itemKey,
        source: sourceForParsedKey(parsed),
        sourceId: sourceIdForParsedKey(parsed),
        shiftDate: current.shiftDate,
        actorUserId,
        actorName: name,
        actorEmail: gate.session.email,
        metadata: { title: item.title, source: item.source }
      });
    } else {
      await undoChecklistCompletion(supabase, {
        itemKey,
        actorUserId,
        actorEmail: gate.session.email
      });
    }

    const state = await loadRuffopsChecklistState(supabase, {
      userId: actorUserId,
      legacyRole: gate.session.role,
      email: gate.session.email
    });
    return NextResponse.json({ ok: true, ...state });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update RuffOps Checklist.";
    const status =
      message.includes("permission") ? 403 : message.includes("updated by someone else") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
