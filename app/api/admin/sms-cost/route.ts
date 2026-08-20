import { NextResponse } from "next/server";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { getUserAccess } from "@/lib/admin/user-access";
import { getServiceSupabase } from "@/lib/supabase/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { hasPermission } from "@/lib/admin/permissions";
import {
  buildSmsCostDashboardForDate,
  loadSmsCostThresholds,
  saveSmsCostThresholds
} from "@/lib/integrations/sms/cost-events";
import { twilioSmartEncodingReport } from "@/lib/integrations/sms/reconcile";
import { resolveSuperAdminPhones, sendSuperAdminSmsAlert } from "@/lib/staff/super-admin-sms";

export const dynamic = "force-dynamic";

async function requireSmsCostAccess(request: Request) {
  if (!isAdminRequest(request)) return { error: unauthorizedAdminResponse() };
  const session = getAdminSessionFromRequest(request);
  if (!session?.adminUserId) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const supabase = getServiceSupabase();
  const access = await getUserAccess(supabase, session.adminUserId, session.role, session.email);
  if (!hasPermission(access, "view_ops_command_center") && !hasPermission(access, "view_admin_panel")) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session, access };
}

export async function GET(request: Request) {
  const gate = await requireSmsCostAccess(request);
  if ("error" in gate && gate.error) return gate.error;

  const url = new URL(request.url);
  const date = url.searchParams.get("date") || undefined;
  const [dashboard, thresholds, smartEncoding] = await Promise.all([
    buildSmsCostDashboardForDate(date || undefined),
    loadSmsCostThresholds(),
    Promise.resolve(twilioSmartEncodingReport())
  ]);

  return NextResponse.json({ dashboard, thresholds, smartEncoding });
}

export async function POST(request: Request) {
  const gate = await requireSmsCostAccess(request);
  if ("error" in gate && gate.error) return gate.error;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action || "");
  if (action === "send_test_alert") {
    const phones = await resolveSuperAdminPhones();
    const stamp = new Date().toISOString();
    const result = await sendSuperAdminSmsAlert({
      kind: "fitdog_alert",
      title: "Test alert (RuffOps)",
      detail: `Admin-triggered multi-recipient SMS test at ${stamp}.`,
      idempotencyKey: `sa-sms:test:${stamp}`,
      adminPath: "/admin?board=staff&tab=ops_command_center"
    });
    return NextResponse.json({
      ok: result.ok,
      skipped: result.skipped ?? false,
      error: result.error ?? null,
      recipientCount: phones.length,
      recipientLast4: phones.map((phone) => phone.slice(-4))
    });
  }

  if (action !== "save_thresholds") {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  const next = await saveSmsCostThresholds({
    dailySegmentWarning: body.dailySegmentWarning != null ? Number(body.dailySegmentWarning) : undefined,
    dailySegmentCritical: body.dailySegmentCritical != null ? Number(body.dailySegmentCritical) : undefined,
    dailyDollarWarning: body.dailyDollarWarning != null ? Number(body.dailyDollarWarning) : undefined
  });

  return NextResponse.json({ ok: true, thresholds: next });
}
