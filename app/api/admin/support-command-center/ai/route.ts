import { NextResponse } from "next/server";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { canReviewManagementSupportWithAccess, isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { loadAdminSettings } from "@/lib/admin/settings";
import { getUserAccess } from "@/lib/admin/user-access";
import { coachPipWithGemini, isGeminiConfigured, type PipAiMode } from "@/lib/hr/gemini-pip";
import { listPipPlans } from "@/lib/hr/pip";
import { getManagementReportById } from "@/lib/staff/management-reports";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const OPS = new Set([
  "summarize_case",
  "draft_follow_up",
  "recommend_pip_action",
  "prepare_check_in",
  "find_missing_docs",
  "analyze_patterns",
  "escalate_summary"
]);

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  const session = getAdminSessionFromRequest(request);
  const supabase = getServiceSupabase();
  const access = session?.adminUserId
    ? await getUserAccess(supabase, session.adminUserId, session.role, session.email)
    : null;
  if (!canReviewManagementSupportWithAccess(access, session?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ gemini_configured: isGeminiConfigured() });
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  const session = getAdminSessionFromRequest(request);
  const supabase = getServiceSupabase();
  const access = session?.adminUserId
    ? await getUserAccess(supabase, session.adminUserId, session.role, session.email)
    : null;
  if (!canReviewManagementSupportWithAccess(access, session?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = (await request.json()) as {
      operation?: string;
      case_id?: string;
      pip_id?: string;
      message?: string;
    };
    const operation = String(body.operation || "");
    if (!OPS.has(operation)) {
      return NextResponse.json({ error: "Unknown AI operation." }, { status: 400 });
    }

    const settings = await loadAdminSettings(supabase);
    let plan = null;
    if (body.pip_id) {
      plan = (await listPipPlans(supabase)).find((row) => row.id === body.pip_id) ?? null;
    }

    let recordContext: string | null = null;
    if (body.case_id) {
      const report = await getManagementReportById(supabase, body.case_id);
      if (report) {
        recordContext = [
          `Case: ${report.title}`,
          `Type: ${report.report_type}`,
          `Priority: ${report.priority ?? "Normal"}`,
          `Status: ${report.admin_status ?? report.status}`,
          `Subject: ${report.employee_name ?? report.dog_handler_name ?? report.submitted_by_name ?? "—"}`,
          `Department: ${report.department ?? "—"}`,
          `Summary: ${(report.groomer_submission_details?.description ?? report.summary).slice(0, 1200)}`
        ].join("\n");
      }
    }

    const modeMap: Record<string, PipAiMode> = {
      summarize_case: "chat",
      draft_follow_up: "manager_talking_points",
      recommend_pip_action: "draft_plan",
      prepare_check_in: "check_in_coach",
      find_missing_docs: "ca_documentation",
      analyze_patterns: "chat",
      escalate_summary: "ca_documentation"
    };

    const prompts: Record<string, string> = {
      summarize_case: "Summarize this support case for a manager. Facts only. Note gaps. No legal conclusions.",
      draft_follow_up: "Draft a professional manager follow-up message. Manager must review before sending.",
      recommend_pip_action: "Recommend possible PIP next steps. Do not activate or discipline. Human confirmation required.",
      prepare_check_in: "Prepare a supportive check-in agenda for the manager.",
      find_missing_docs: "List missing documentation risks for employer-protective California-aware management.",
      analyze_patterns: "Identify repeated patterns if evidence supports them. Do not invent facts.",
      escalate_summary: "Prepare an HR escalation summary draft. Do not escalate automatically."
    };

    const reply = await coachPipWithGemini({
      settings,
      mode: modeMap[operation] ?? "chat",
      userMessage: `${prompts[operation]}\n\n${String(body.message || "").trim()}`.trim(),
      plan,
      recordContext
    });

    await writeAdminAuditLog({
      actorAdminId: session?.adminUserId,
      actorEmail: session?.email ?? access?.displayLabel ?? null,
      action: "staff.support_command_center.ai_generate",
      targetType: body.case_id ? "management_report" : body.pip_id ? "pip" : "support_command_center",
      targetId: body.case_id || body.pip_id || "ai",
      details: { operation, status: "generated_pending_manager_review" }
    });

    return NextResponse.json({
      reply,
      operation,
      label: "AI-generated — manager review required",
      analyzed: {
        case_id: body.case_id ?? null,
        pip_id: body.pip_id ?? null,
        generated_at: new Date().toISOString()
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI unavailable.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
