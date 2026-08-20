import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { resolveSuperAdminPhones, sendSuperAdminSmsAlert } from "@/lib/staff/super-admin-sms";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** On-demand production test: SMS every Super Admin alert recipient. Requires CRON_SECRET. */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const phones = await resolveSuperAdminPhones();
  const stamp = new Date().toISOString();
  const result = await sendSuperAdminSmsAlert({
    kind: "fitdog_alert",
    title: "Test alert (RuffOps)",
    detail: `Production multi-recipient SMS test at ${stamp}.`,
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
