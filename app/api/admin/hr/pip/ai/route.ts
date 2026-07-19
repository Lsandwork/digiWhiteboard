import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { canAccessHrPanelsForUser } from "@/lib/admin/permissions";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { loadAdminSettings } from "@/lib/admin/settings";
import { getUserAccess } from "@/lib/admin/user-access";
import { inferEmployeeRoleFromHrSignals } from "@/lib/hr/fitdog-roles";
import { coachPipWithGemini, extractPipDraftFields, isGeminiConfigured, type PipAiMode } from "@/lib/hr/gemini-pip";
import { listPipPlans } from "@/lib/hr/pip";
import { isHrRecord, toHrRecord } from "@/lib/hr/records";
import { getManagementReportById } from "@/lib/staff/management-reports";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const MODES = new Set<PipAiMode>([
  "draft_plan",
  "employee_summary",
  "check_in_coach",
  "manager_talking_points",
  "ca_documentation",
  "chat"
]);

function forbiddenResponse() {
  return NextResponse.json({ error: "You do not have permission to use PIP AI." }, { status: 403 });
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  const session = getAdminSessionFromRequest(request);
  const supabase = getServiceSupabase();
  const access = session?.adminUserId
    ? await getUserAccess(supabase, session.adminUserId, session.role, session.email)
    : null;
  if (!canAccessHrPanelsForUser(access, session?.role)) return forbiddenResponse();

  const settings = await loadAdminSettings(supabase);
  return NextResponse.json({
    gemini_configured: isGeminiConfigured(),
    hr_consult_enabled: settings.hr_consult_enabled,
    location: `${settings.hr_company_city}, ${settings.hr_company_region}`
  });
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  const session = getAdminSessionFromRequest(request);
  const supabase = getServiceSupabase();
  const access = session?.adminUserId
    ? await getUserAccess(supabase, session.adminUserId, session.role, session.email)
    : null;
  if (!canAccessHrPanelsForUser(access, session?.role)) return forbiddenResponse();

  try {
    const body = (await request.json()) as {
      mode?: string;
      message?: string;
      plan_id?: string;
      record_ids?: string[];
    };
    const mode = (body.mode || "chat") as PipAiMode;
    if (!MODES.has(mode)) {
      return NextResponse.json({ error: "Invalid AI mode." }, { status: 400 });
    }

    const settings = await loadAdminSettings(supabase);
    let plan = null;
    if (body.plan_id) {
      const plans = await listPipPlans(supabase);
      plan = plans.find((row) => row.id === body.plan_id) ?? null;
    }

    const recordIds = Array.isArray(body.record_ids) ? body.record_ids.map(String) : [];
    const recordChunks: string[] = [];
    for (const id of recordIds.slice(0, 8)) {
      const report = await getManagementReportById(supabase, id);
      if (!report || !isHrRecord(report)) continue;
      const record = toHrRecord(report);
      const inferredRole = inferEmployeeRoleFromHrSignals({
        report_type: report.report_type,
        department: record.department,
        subject_name: record.subject_name,
        title: record.title,
        summary: record.summary,
        dog_handler_name: report.dog_handler_name,
        employee_department: report.write_up_details?.employee_department
      });
      recordChunks.push(
        [
          `Record ${record.id}`,
          `Report type: ${record.report_type}`,
          `Kind: ${record.kind}`,
          `Subject employee: ${record.subject_name ?? "—"}`,
          report.dog_handler_name ? `Dog handler named on record: ${report.dog_handler_name}` : null,
          `Inferred job role for PIP goals: ${inferredRole ?? "unknown — ask manager before assuming"}`,
          `Routing department on record (may be who filed/routed, NOT always the employee's job): ${record.department ?? "—"}`,
          `Title: ${record.title}`,
          `Status: ${record.status}`,
          `Summary: ${record.summary}`,
          inferredRole === "Dog Handler"
            ? "IMPORTANT: This employee is a Dog Handler (yard care / dog monitoring / walk-outs). Do NOT draft front-desk booking goals."
            : null
        ]
          .filter(Boolean)
          .join("\n")
      );
    }

    const reply = await coachPipWithGemini({
      settings,
      mode,
      userMessage: String(body.message || "").trim() || "Help me with this PIP.",
      plan,
      recordContext: recordChunks.length ? recordChunks.join("\n\n") : null
    });

    return NextResponse.json({
      reply,
      draft_fields: mode === "draft_plan" || mode === "employee_summary" ? extractPipDraftFields(reply) : null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to run PIP AI.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
