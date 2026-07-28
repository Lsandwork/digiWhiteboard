import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { getUserAccess } from "@/lib/admin/user-access";
import { canManagePackProTraining, canViewPackProTraining } from "@/lib/pack-pro/access";
import { packProCredentialsConfigured } from "@/lib/pack-pro/config";
import { PACK_PRO_REQUIRED_COURSES } from "@/lib/pack-pro/courses";
import { notifyPackProIncompleteTraining } from "@/lib/pack-pro/notifications";
import { buildPackProSummary, loadPackProTrainingState } from "@/lib/pack-pro/store";
import { runPackProTrainingSync } from "@/lib/pack-pro/sync";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const runtime = "nodejs";

async function requireAccess(request: Request) {
  if (!isAdminRequest(request)) return { error: unauthorizedAdminResponse() };
  const session = getAdminSessionFromRequest(request);
  const supabase = getServiceSupabase();
  const access = session
    ? await getUserAccess(supabase, session.adminUserId, session.role, session.email)
    : null;
  if (!canViewPackProTraining(access, session?.role)) {
    return { error: NextResponse.json({ error: "Pack Pro Training access required." }, { status: 403 }) };
  }
  return {
    session,
    access,
    supabase,
    canManage: canManagePackProTraining(access, session?.role)
  };
}

export async function GET(request: Request) {
  const gate = await requireAccess(request);
  if ("error" in gate && gate.error) return gate.error;

  const url = new URL(request.url);
  const view = url.searchParams.get("view") || "list";
  const status = url.searchParams.get("status") || "all";
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  const supabase = gate.supabase!;

  try {
    const state = await loadPackProTrainingState(supabase);
    let learners = state.learners;

    if (status === "incomplete") learners = learners.filter((row) => !row.is_complete);
    if (status === "complete") learners = learners.filter((row) => row.is_complete);
    if (status === "not_started") learners = learners.filter((row) => row.overall_percent === 0);
    if (q) {
      learners = learners.filter(
        (row) => row.name.toLowerCase().includes(q) || row.email.toLowerCase().includes(q)
      );
    }

    if (view === "sync") {
      return NextResponse.json({
        history: state.sync_runs.slice(0, 20),
        last_synced_at: state.last_synced_at,
        credentials_configured: packProCredentialsConfigured(),
        canManage: gate.canManage,
        courses: PACK_PRO_REQUIRED_COURSES
      });
    }

    return NextResponse.json({
      rows: learners,
      total: learners.length,
      summary: buildPackProSummary(state.learners, state.last_synced_at),
      courses: PACK_PRO_REQUIRED_COURSES,
      credentials_configured: packProCredentialsConfigured(),
      last_synced_at: state.last_synced_at,
      last_alert_at: state.last_alert_at,
      canManage: gate.canManage
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load Pack Pro Training." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const gate = await requireAccess(request);
  if ("error" in gate && gate.error) return gate.error;
  if (!gate.canManage) {
    return NextResponse.json({ error: "Manage Pack Pro Training permission required." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { action?: string };
  const action = body.action || "sync";
  const actor = gate.access?.displayLabel || gate.session?.email || "Admin";

  try {
    if (action === "sync") {
      const result = await runPackProTrainingSync(gate.supabase!, {
        trigger: "manual",
        actor,
        force: true
      });
      return NextResponse.json(result);
    }

    if (action === "alert_incomplete") {
      const state = await loadPackProTrainingState(gate.supabase!);
      const result = await notifyPackProIncompleteTraining(gate.supabase!, state.learners, {
        actor,
        force: true
      });
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Pack Pro Training action failed." },
      { status: 500 }
    );
  }
}
