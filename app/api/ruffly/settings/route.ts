import { NextResponse } from "next/server";
import { requireRufflyPermission } from "@/lib/ruffly/api-auth";
import { writeRufflyAuditLog } from "@/lib/ruffly/audit";
import { rufflyFlagSnapshot } from "@/lib/ruffly/flags";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireRufflyPermission(request, "ruffly.settings.manage");
  // Allow dashboard viewers to read setup status
  if (!auth.ok) {
    const view = await requireRufflyPermission(request, "ruffly.dashboard.view");
    if (!view.ok) return view.response;
  }

  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase.from("ruffly_settings").select("*").eq("id", "default").maybeSingle();
    if (error) throw error;
    return NextResponse.json({
      settings: data ?? { setup_completed: false, setup_step: 0 },
      flags: rufflyFlagSnapshot()
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load settings.";
    if (message.includes("does not exist") || message.includes("schema cache")) {
      return NextResponse.json({
        settings: { setup_completed: false, setup_step: 0 },
        flags: rufflyFlagSnapshot(),
        warning: "Ruffly tables not migrated yet."
      });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireRufflyPermission(request, "ruffly.settings.manage");
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const supabase = getServiceSupabase();
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const key of [
      "setup_completed",
      "setup_step",
      "business_name",
      "business_profile",
      "quiet_hours",
      "consent_wording_version",
      "review_request_delay_minutes",
      "webchat_config",
      "sending_channels"
    ]) {
      if (key in body) patch[key] = body[key];
    }

    const { data, error } = await supabase
      .from("ruffly_settings")
      .upsert({ id: "default", ...patch })
      .select("*")
      .single();
    if (error) throw error;

    await writeRufflyAuditLog({
      actorUserId: auth.session?.adminUserId,
      actorEmail: auth.session?.email,
      action: "ruffly.settings.update",
      entityType: "ruffly_settings",
      entityId: "default",
      details: { keys: Object.keys(patch) }
    });

    return NextResponse.json({ settings: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update settings.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
