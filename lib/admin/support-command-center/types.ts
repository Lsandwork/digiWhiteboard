import type { PipDocumentationStatus, PipPlan, PipRiskLevel, PipStage } from "@/lib/hr/pip";
import type { ManagementReport, SupportAdminStatus, SupportPriority } from "@/lib/staff/management-reports";

export type AlertSeverity = "Critical" | "Urgent" | "High" | "Medium" | "Low";
export type ComplianceRisk = "Low" | "Moderate" | "High" | "Critical";

export type CommandCenterKpis = {
  active_pips: number;
  urgent_alerts_open: number;
  escalations_today: number;
  overdue_checkins: number;
  compliance_risk: ComplianceRisk;
  compliance_item_count: number;
  resolved_this_week: number;
  comparisons: {
    active_pips: string | null;
    urgent_alerts_open: string | null;
    escalations_today: string | null;
    overdue_checkins: string | null;
    resolved_this_week: string | null;
  };
  tooltips: Record<string, string>;
};

export type UrgentAlertRow = {
  id: string;
  source: "support_case" | "pip_review";
  source_id: string;
  severity: AlertSeverity;
  triggered_at: string;
  sla_due_at: string;
  sla_remaining_ms: number;
  sla_total_ms: number;
  employee: string;
  department: string;
  alert_type: string;
  summary: string;
  assigned_manager: string | null;
  acknowledged: boolean;
  acknowledged_at: string | null;
  status: string;
  report: ManagementReport | null;
  pip: PipPlan | null;
};

export type PipManagerRow = {
  id: string;
  employee_name: string;
  department: string | null;
  stage: PipStage;
  start_date: string;
  next_review_date: string | null;
  progress_percent: number;
  manager_name: string | null;
  risk_level: PipRiskLevel;
  documentation_status: PipDocumentationStatus;
  latest_activity: string;
  status: string;
  plan: PipPlan;
};

export type ActivityEvent = {
  id: string;
  at: string;
  event_type: string;
  summary: string;
  actor: string;
  employee: string | null;
  department: string | null;
  assigned_manager: string | null;
  badge: string;
  case_id: string | null;
  pip_id: string | null;
  category: "alert" | "pip" | "comment" | "followup" | "ack" | "docs" | "system";
};

export type InsightCharts = {
  pip_completion_rate: number;
  pip_completed: number;
  pip_closed_total: number;
  open_alerts_by_department: Array<{ department: string; count: number }>;
  urgent_issue_trend: Array<{ day: string; count: number }>;
};

export type AiPanelSeed = {
  risk_summary: string;
  top_risk_factors: Array<{ label: string; count: number }>;
  suggested_next_steps: string[];
  missing_documentation: number;
  overdue_actions: number;
  gemini_configured: boolean;
};

export type CommandCenterPayload = {
  kpis: CommandCenterKpis;
  alerts: UrgentAlertRow[];
  pips: PipManagerRow[];
  activity: ActivityEvent[];
  insights: InsightCharts;
  ai: AiPanelSeed;
  cases: Array<{
    id: string;
    title: string;
    employee: string | null;
    department: string | null;
    type: string;
    priority: SupportPriority;
    status: SupportAdminStatus;
    assigned_to: string | null;
    created_at: string;
    report: ManagementReport;
  }>;
  currentUser: { email: string | null; role: string | null };
  generated_at: string;
};
