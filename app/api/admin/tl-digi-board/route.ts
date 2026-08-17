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
  loadTlDigiBoardConfig,
  loadTlDigiBoardSnapshot,
  toTlDigiBoardAdminConfigView,
  updateTlDigiBoardConfig
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
      loadTlDigiBoardSnapshot(supabase)
    ]);
    return NextResponse.json({
      config: toTlDigiBoardAdminConfigView(config),
      snapshot,
      permissions: {
        canView: true,
        canManage: true
      },
      gingr: {
        keyEnv: "TL_GINGR_KEY",
        keyConfigured: Boolean(process.env.TL_GINGR_KEY?.trim())
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
  const patch: {
    displayTitle?: string;
    enabled?: boolean;
    display?: {
      displayTitle?: string;
      enabled?: boolean;
      showOtherSpecial?: boolean;
      preferBackOfHouseLodging?: boolean;
    };
  } = {};

  if (typeof body.displayTitle === "string") {
    patch.displayTitle = body.displayTitle.trim() || "Team Lead Alerts + Reminders";
  }
  if (typeof body.enabled === "boolean") {
    patch.enabled = body.enabled;
  }
  if (body.display && typeof body.display === "object") {
    const display = body.display as Record<string, unknown>;
    patch.display = {};
    if (typeof display.displayTitle === "string") patch.display.displayTitle = display.displayTitle;
    if (typeof display.enabled === "boolean") patch.display.enabled = display.enabled;
    if (typeof display.showOtherSpecial === "boolean") patch.display.showOtherSpecial = display.showOtherSpecial;
    if (typeof display.preferBackOfHouseLodging === "boolean") {
      patch.display.preferBackOfHouseLodging = display.preferBackOfHouseLodging;
    }
  }

  if (!Object.keys(patch).length && !patch.display) {
    return NextResponse.json({ error: "No TL Digi Board config changes provided." }, { status: 400 });
  }
  if (!patch.displayTitle && patch.enabled == null && !patch.display) {
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

    return NextResponse.json({ ok: true, config: toTlDigiBoardAdminConfigView(config) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update TL Digi Board.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  return mutateConfig(request);
}

export async function POST(request: Request) {
  return mutateConfig(request);
}
