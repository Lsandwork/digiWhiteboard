import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import {
  accessFromLegacyRole,
  isFullAdminLegacyRole,
  isSuperAdminAccess
} from "@/lib/admin/permissions";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { getRequestUserAccess } from "@/lib/auth/permissions";
import { getServiceSupabase } from "@/lib/supabase/server";
import {
  getTlDigiBoardSnapshot,
  loadTlDigiBoardConfig,
  updateTlDigiBoardConfig,
  type TlDigiBoardConfigPatch
} from "@/lib/tl-digi-board/server";

export const dynamic = "force-dynamic";

function isTlDigiBoardFullAdmin(
  access: Awaited<ReturnType<typeof getRequestUserAccess>>,
  legacyRole?: string | null
) {
  return isFullAdminLegacyRole(legacyRole) || isSuperAdminAccess(access);
}

async function resolveAccess(request: Request) {
  const session = getAdminSessionFromRequest(request);
  if (!session?.email) return { session: null, access: null };
  const access =
    (await getRequestUserAccess(request)) ??
    accessFromLegacyRole(session.adminUserId ?? null, session.email, session.role);
  return { session, access };
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const { session, access } = await resolveAccess(request);
  if (!session?.email) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // Admin config API: full admin (owner/manager) only — view and manage.
  if (!isTlDigiBoardFullAdmin(access, session.role)) {
    return NextResponse.json({ error: "TL Digi Board admin access required." }, { status: 403 });
  }

  try {
    const supabase = getServiceSupabase();
    const [config, snapshot] = await Promise.all([
      loadTlDigiBoardConfig(supabase),
      getTlDigiBoardSnapshot(supabase)
    ]);
    return NextResponse.json({
      config,
      snapshot,
      permissions: {
        canView: true,
        canManage: true
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load TL Digi Board.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function mutateConfig(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const { session, access } = await resolveAccess(request);
  if (!session?.email) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // Server-side full-admin gate for config mutations.
  if (!isFullAdminLegacyRole(session.role) && !isSuperAdminAccess(access)) {
    return NextResponse.json({ error: "Full admin access required to update TL Digi Board." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: TlDigiBoardConfigPatch = {};

  if (body.lodging && typeof body.lodging === "object") {
    patch.lodging = body.lodging as TlDigiBoardConfigPatch["lodging"];
  }
  if (body.display && typeof body.display === "object") {
    patch.display = body.display as TlDigiBoardConfigPatch["display"];
  }
  if (body.protected && typeof body.protected === "object") {
    patch.protected = body.protected as TlDigiBoardConfigPatch["protected"];
  }

  // Convenience flat fields from the simple admin panel.
  if (typeof body.showOtherSpecial === "boolean" || typeof body.preferBackOfHouseLodging === "boolean") {
    patch.display = {
      ...(patch.display ?? {}),
      ...(typeof body.showOtherSpecial === "boolean" ? { showOtherSpecial: body.showOtherSpecial } : {}),
      ...(typeof body.preferBackOfHouseLodging === "boolean"
        ? { preferBackOfHouseLodging: body.preferBackOfHouseLodging }
        : {})
    };
  }

  if (!patch.lodging && !patch.display && !patch.protected) {
    return NextResponse.json({ error: "No TL Digi Board config changes provided." }, { status: 400 });
  }

  try {
    const supabase = getServiceSupabase();
    const config = await updateTlDigiBoardConfig(supabase, patch, {
      role: session.role,
      email: session.email,
      userId: session.adminUserId ?? null
    });

    await writeAdminAuditLog({
      actorAdminId: session.adminUserId,
      actorEmail: session.email,
      action: "tl_digi_board.config.updated",
      targetType: "tl_digi_board",
      targetId: "config",
      details: { keys: Object.keys(patch), patch }
    });

    return NextResponse.json({ ok: true, config });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update TL Digi Board.";
    const status = message.includes("full admin") || message.includes("Only full admins") ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: Request) {
  return mutateConfig(request);
}

export async function POST(request: Request) {
  return mutateConfig(request);
}
