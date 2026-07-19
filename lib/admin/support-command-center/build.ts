type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

import { isGeminiConfigured } from "@/lib/hr/gemini-config";
import { activePipPlans, listPipPlans, type PipPlan } from "@/lib/hr/pip";
import { listAllManagementReports, type ManagementReport } from "@/lib/staff/management-reports";
import { mapReportToInboxRow } from "@/lib/staff/management-support-admin";
import type {
  ActivityEvent,
  AlertSeverity,
  CommandCenterKpis,
  CommandCenterPayload,
  ComplianceRisk,
  InsightCharts,
  PipManagerRow,
  UrgentAlertRow
} from "@/lib/admin/support-command-center/types";

const SLA_MINUTES: Record<AlertSeverity, number> = {
  Critical: 30,
  Urgent: 60,
  High: 240,
  Medium: 1440,
  Low: 4320
};

function startOfLocalDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfLocalWeek(d = new Date()) {
  const x = startOfLocalDay(d);
  const day = x.getDay();
  const diff = day === 0 ? 6 : day - 1;
  x.setDate(x.getDate() - diff);
  return x;
}

function isOpenStatus(status: string | undefined) {
  return !["Closed", "Resolved", "Reviewed"].includes(status ?? "");
}

function severityFromReport(report: ManagementReport): AlertSeverity {
  if (report.priority === "Urgent") return report.escalated_at ? "Critical" : "Urgent";
  if (report.priority === "High") return "High";
  return "Medium";
}

function alertTypeFromReport(report: ManagementReport) {
  if (report.report_type.includes("complaint")) return "Employee complaint";
  if (report.report_type.includes("request")) return "Employee request";
  if (report.report_type === "owner_complaint_dog_handler") return "Client complaint";
  if (report.report_type === "employee_write_up") return "Performance concern";
  return "Custom alert";
}

function slaFor(severity: AlertSeverity, triggeredAt: string) {
  const totalMs = SLA_MINUTES[severity] * 60_000;
  const due = new Date(new Date(triggeredAt).getTime() + totalMs);
  return {
    sla_due_at: due.toISOString(),
    sla_remaining_ms: due.getTime() - Date.now(),
    sla_total_ms: totalMs
  };
}

function buildAlerts(reports: ManagementReport[], plans: PipPlan[]): UrgentAlertRow[] {
  const fromCases: UrgentAlertRow[] = reports
    .filter((report) => isOpenStatus(report.admin_status ?? report.status))
    .filter((report) => report.priority === "Urgent" || report.priority === "High" || Boolean(report.escalated_at))
    .map((report) => {
      const severity = severityFromReport(report);
      const triggered_at = report.created_at;
      const sla = slaFor(severity, triggered_at);
      const row = mapReportToInboxRow(report);
      return {
        id: `case-${report.id}`,
        source: "support_case" as const,
        source_id: report.id,
        severity,
        triggered_at,
        ...sla,
        employee: row.submitted_by,
        department: row.department,
        alert_type: alertTypeFromReport(report),
        summary: row.subject,
        assigned_manager: report.assigned_to ?? null,
        acknowledged: Boolean(report.acknowledged_at),
        acknowledged_at: report.acknowledged_at ?? null,
        status: report.admin_status ?? report.status,
        report,
        pip: null
      };
    });

  const fromPips: UrgentAlertRow[] = plans
    .filter((plan) => plan.status === "Active" || plan.status === "On Hold")
    .filter((plan) => plan.next_review_date && new Date(`${plan.next_review_date}T12:00:00`).getTime() < Date.now())
    .map((plan) => {
      const triggered_at = `${plan.next_review_date}T12:00:00.000Z`;
      const severity: AlertSeverity = "High";
      const sla = slaFor(severity, triggered_at);
      return {
        id: `pip-review-${plan.id}`,
        source: "pip_review" as const,
        source_id: plan.id,
        severity,
        triggered_at,
        ...sla,
        employee: plan.employee_name,
        department: plan.employee_role || "—",
        alert_type: "Missed PIP review",
        summary: `Overdue review for ${plan.focus_area}`,
        assigned_manager: plan.manager_name,
        acknowledged: false,
        acknowledged_at: null,
        status: "Overdue",
        report: null,
        pip: plan
      };
    });

  return [...fromCases, ...fromPips].sort((a, b) => {
    const rank = (s: AlertSeverity) =>
      s === "Critical" ? 0 : s === "Urgent" ? 1 : s === "High" ? 2 : s === "Medium" ? 3 : 4;
    if (rank(a.severity) !== rank(b.severity)) return rank(a.severity) - rank(b.severity);
    return new Date(b.triggered_at).getTime() - new Date(a.triggered_at).getTime();
  });
}

function buildPipRows(plans: PipPlan[]): PipManagerRow[] {
  return activePipPlans(plans).map((plan) => {
    const latest = plan.check_ins[0];
    return {
      id: plan.id,
      employee_name: plan.employee_name,
      department: plan.employee_role,
      stage: plan.stage,
      start_date: plan.start_date,
      next_review_date: plan.next_review_date,
      progress_percent: plan.progress_percent,
      manager_name: plan.manager_name,
      risk_level: plan.risk_level,
      documentation_status: plan.documentation_status,
      latest_activity: latest
        ? `Check-in ${latest.date}: ${latest.note.slice(0, 80)}`
        : `Created ${new Date(plan.created_at).toLocaleDateString()}`,
      status: plan.status,
      plan
    };
  });
}

function buildActivity(reports: ManagementReport[], plans: PipPlan[]): ActivityEvent[] {
  const events: ActivityEvent[] = [];

  for (const report of reports) {
    events.push({
      id: `created-${report.id}`,
      at: report.created_at,
      event_type: "case_created",
      summary: `New ${report.item_type ?? "case"} received: ${report.title}`,
      actor: report.submitted_by_name ?? report.created_by ?? "System",
      employee: report.employee_name ?? report.dog_handler_name ?? report.submitted_by_name ?? null,
      department: report.department ?? null,
      assigned_manager: report.assigned_to ?? null,
      badge: report.priority === "Urgent" ? "Critical" : report.item_type === "complaint" ? "Complaint" : "Request",
      case_id: report.id,
      pip_id: null,
      category: report.priority === "Urgent" || report.priority === "High" ? "alert" : "system"
    });
    for (const entry of report.audit_history ?? []) {
      events.push({
        id: entry.id,
        at: entry.created_at,
        event_type: entry.action,
        summary: `${entry.action.replace(/_/g, " ")} on ${report.title}${
          entry.new_value ? `: ${entry.new_value}` : ""
        }`,
        actor: entry.performed_by,
        employee: report.employee_name ?? report.submitted_by_name ?? null,
        department: report.department ?? null,
        assigned_manager: report.assigned_to ?? null,
        badge: entry.action,
        case_id: report.id,
        pip_id: null,
        category:
          entry.action === "acknowledge"
            ? "ack"
            : entry.action.includes("note") || entry.action.includes("response")
              ? "comment"
              : entry.action === "escalate"
                ? "alert"
                : "system"
      });
    }
    for (const comment of report.comments ?? []) {
      events.push({
        id: comment.id,
        at: comment.created_at,
        event_type: "comment_added",
        summary: `${comment.visibility === "internal" ? "Internal note" : "Comment"} on ${report.title}`,
        actor: comment.user_name,
        employee: report.employee_name ?? report.submitted_by_name ?? null,
        department: report.department ?? null,
        assigned_manager: report.assigned_to ?? null,
        badge: "Comment",
        case_id: report.id,
        pip_id: null,
        category: "comment"
      });
    }
  }

  for (const plan of plans) {
    events.push({
      id: `pip-created-${plan.id}`,
      at: plan.created_at,
      event_type: "pip_created",
      summary: `PIP created for ${plan.employee_name}: ${plan.focus_area}`,
      actor: plan.created_by ?? "Manager",
      employee: plan.employee_name,
      department: plan.employee_role,
      assigned_manager: plan.manager_name,
      badge: "PIP",
      case_id: null,
      pip_id: plan.id,
      category: "pip"
    });
    for (const checkIn of plan.check_ins) {
      events.push({
        id: checkIn.id,
        at: checkIn.created_at,
        event_type: "pip_check_in",
        summary: `PIP check-in for ${plan.employee_name}`,
        actor: checkIn.created_by ?? "Manager",
        employee: plan.employee_name,
        department: plan.employee_role,
        assigned_manager: plan.manager_name,
        badge: "Follow-up",
        case_id: null,
        pip_id: plan.id,
        category: "followup"
      });
    }
  }

  return events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 80);
}

function complianceRisk(alerts: UrgentAlertRow[], plans: PipPlan[], reports: ManagementReport[]): {
  level: ComplianceRisk;
  count: number;
} {
  const overdueDocs = plans.filter((p) => p.documentation_status === "Overdue Review" || p.documentation_status === "Incomplete").length;
  const urgentOpen = alerts.filter((a) => a.severity === "Critical" || a.severity === "Urgent").length;
  const openComplaints = reports.filter(
    (r) => r.item_type === "complaint" && isOpenStatus(r.admin_status ?? r.status)
  ).length;
  const count = urgentOpen + overdueDocs + Math.min(openComplaints, 5);
  if (count >= 12 || urgentOpen >= 5) return { level: "Critical", count };
  if (count >= 8 || urgentOpen >= 3) return { level: "High", count };
  if (count >= 4) return { level: "Moderate", count };
  return { level: "Low", count };
}

function buildInsights(plans: PipPlan[], alerts: UrgentAlertRow[]): InsightCharts {
  const closed = plans.filter((p) => p.status === "Completed" || p.status === "Cancelled");
  const completed = plans.filter((p) => p.status === "Completed" || p.stage === "Successfully Completed");
  const byDept = new Map<string, number>();
  for (const alert of alerts) {
    const key = alert.department || "Other";
    byDept.set(key, (byDept.get(key) ?? 0) + 1);
  }
  const trend: Array<{ day: string; count: number }> = [];
  for (let i = 6; i >= 0; i -= 1) {
    const day = startOfLocalDay();
    day.setDate(day.getDate() - i);
    const label = day.toISOString().slice(0, 10);
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    const count = alerts.filter((a) => {
      const t = new Date(a.triggered_at).getTime();
      return t >= day.getTime() && t < next.getTime() && (a.severity === "Critical" || a.severity === "Urgent" || a.severity === "High");
    }).length;
    trend.push({ day: label, count });
  }
  return {
    pip_completion_rate: closed.length ? Math.round((completed.length / closed.length) * 100) : 0,
    pip_completed: completed.length,
    pip_closed_total: closed.length,
    open_alerts_by_department: [...byDept.entries()]
      .map(([department, count]) => ({ department, count }))
      .sort((a, b) => b.count - a.count),
    urgent_issue_trend: trend
  };
}

function buildKpis(
  plans: PipPlan[],
  alerts: UrgentAlertRow[],
  reports: ManagementReport[]
): CommandCenterKpis {
  const active = activePipPlans(plans);
  const todayStart = startOfLocalDay().getTime();
  const weekStart = startOfLocalWeek().getTime();
  const escalationsToday = reports.filter((r) => r.escalated_at && new Date(r.escalated_at).getTime() >= todayStart).length;
  const overdueCheckins = plans.filter((p) => {
    if (p.status !== "Active" && p.status !== "On Hold") return false;
    if (!p.next_review_date) return false;
    return new Date(`${p.next_review_date}T12:00:00`).getTime() < Date.now();
  }).length;
  const resolvedWeek = reports.filter((r) => {
    const closed = r.closed_at || (["Closed", "Resolved"].includes(r.admin_status ?? "") ? r.updated_at : null);
    return closed && new Date(closed).getTime() >= weekStart;
  }).length;
  const risk = complianceRisk(alerts, plans, reports);
  const urgentOpen = alerts.filter((a) => isOpenStatus(a.status) || a.status === "Overdue").length;

  return {
    active_pips: active.length,
    urgent_alerts_open: urgentOpen,
    escalations_today: escalationsToday,
    overdue_checkins: overdueCheckins,
    compliance_risk: risk.level,
    compliance_item_count: risk.count,
    resolved_this_week: resolvedWeek,
    comparisons: {
      active_pips: null,
      urgent_alerts_open: null,
      escalations_today: null,
      overdue_checkins: null,
      resolved_this_week: null
    },
    tooltips: {
      active_pips: "PIPs with status Active or On Hold (not completed, cancelled, or archived).",
      urgent_alerts_open: "Open support cases marked High/Urgent/Critical plus overdue PIP reviews.",
      escalations_today: "Cases escalated during the current local calendar day.",
      overdue_checkins: "Active PIPs with next review date before now.",
      compliance_risk: "Derived from unresolved urgent items, overdue PIP documentation, and open complaints.",
      resolved_this_week: "Support cases closed or resolved since the start of the local week."
    }
  };
}

export async function buildSupportCommandCenter(
  supabase: SupabaseClient,
  currentUser: { email: string | null; role: string | null }
): Promise<CommandCenterPayload> {
  const [reports, plans] = await Promise.all([listAllManagementReports(supabase), listPipPlans(supabase)]);
  const visibleReports = reports.filter((r) => !r.hr_hub_hidden);
  const alerts = buildAlerts(visibleReports, plans);
  const pipRows = buildPipRows(plans);
  const activity = buildActivity(visibleReports, plans);
  const insights = buildInsights(plans, alerts);
  const kpis = buildKpis(plans, alerts, visibleReports);

  const openComplaints = visibleReports.filter((r) => r.item_type === "complaint" && isOpenStatus(r.admin_status ?? r.status)).length;
  const missingDocs = plans.filter((p) => p.documentation_status !== "Complete" && (p.status === "Active" || p.status === "On Hold")).length;

  return {
    kpis,
    alerts: alerts.slice(0, 50),
    pips: pipRows,
    activity,
    insights,
    ai: {
      risk_summary: `${kpis.compliance_risk} compliance posture with ${kpis.urgent_alerts_open} open urgent items and ${kpis.active_pips} active PIPs.`,
      top_risk_factors: [
        { label: "Urgent / critical alerts", count: alerts.filter((a) => a.severity === "Critical" || a.severity === "Urgent").length },
        { label: "Overdue PIP reviews", count: kpis.overdue_checkins },
        { label: "Open complaints", count: openComplaints },
        { label: "Incomplete PIP documentation", count: missingDocs }
      ].filter((f) => f.count > 0),
      suggested_next_steps: [
        kpis.urgent_alerts_open ? "Triage unacknowledged urgent alerts first" : "Review open support inbox for new submissions",
        kpis.overdue_checkins ? "Complete overdue PIP check-ins today" : "Confirm upcoming PIP reviews are scheduled",
        missingDocs ? "Close documentation gaps on active PIPs" : "Keep documentation status complete on active plans"
      ],
      missing_documentation: missingDocs,
      overdue_actions: kpis.overdue_checkins + alerts.filter((a) => a.sla_remaining_ms < 0).length,
      gemini_configured: isGeminiConfigured()
    },
    cases: visibleReports
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 100)
      .map((report) => ({
        id: report.id,
        title: report.title,
        employee: report.employee_name ?? report.dog_handler_name ?? report.submitted_by_name ?? null,
        department: report.department ?? null,
        type: report.item_type ?? report.report_type,
        priority: report.priority ?? "Normal",
        status: report.admin_status ?? "Submitted",
        assigned_to: report.assigned_to ?? null,
        created_at: report.created_at,
        report
      })),
    currentUser,
    generated_at: new Date().toISOString()
  };
}
