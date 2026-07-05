type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export type ManagementReportStatus = "Open" | "Needs Review" | "Reviewed" | "Closed";

export type ManagementReportType = "owner_complaint_dog_handler" | "employee_write_up";

export type EmployeeWriteUpDetails = {
  employee_name: string;
  employee_department: string;
  incident_date: string;
  incident_time: string | null;
  shift_location: string | null;
  policy_violated: string | null;
  incident_description: string;
  witnesses: string | null;
  prior_discussion: string | null;
  corrective_action: string | null;
  team_lead_signature: string | null;
};

export type ManagementReport = {
  id: string;
  report_type: ManagementReportType;
  title: string;
  dog_handler_name: string | null;
  employee_name: string | null;
  summary: string;
  write_up_details: EmployeeWriteUpDetails | null;
  source: "push_notice" | "team_lead_form";
  status: ManagementReportStatus;
  visibility: "admin_management" | "submitter_review";
  push_notice_id: string | null;
  related_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

const SETTINGS_STORE_KEY = "management_reports";
const MAX_NAME_LENGTH = 80;
const MAX_SUMMARY_LENGTH = 600;
const MAX_FIELD_LENGTH = 1200;

type ManagementReportState = {
  reports: ManagementReport[];
};

function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `mgmt-report-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isMissingRelation(error: { code?: string; message?: string } | null) {
  return error?.code === "42P01" || error?.code === "PGRST205" || Boolean(error?.message?.includes("schema cache"));
}

function sortNewest(reports: ManagementReport[]) {
  return [...reports].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

function emptyState(): ManagementReportState {
  return { reports: [] };
}

function normalizeReport(report: ManagementReport): ManagementReport {
  return {
    ...report,
    dog_handler_name: report.dog_handler_name ?? null,
    employee_name: report.employee_name ?? (report.write_up_details?.employee_name ?? null),
    write_up_details: report.write_up_details ?? null
  };
}

function parseState(value: unknown): ManagementReportState {
  if (!value || typeof value !== "object") return emptyState();
  const reports = Array.isArray((value as { reports?: unknown }).reports)
    ? ((value as { reports: ManagementReport[] }).reports).map(normalizeReport)
    : [];
  return { reports: sortNewest(reports) };
}

async function loadStateFromAdminSettings(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("admin_settings").select("settings").eq("id", "default").maybeSingle();
  if (error) {
    if (isMissingRelation(error)) return null;
    throw error;
  }
  const settings = (data?.settings ?? {}) as Record<string, unknown>;
  return parseState(settings[SETTINGS_STORE_KEY]);
}

async function saveStateToAdminSettings(supabase: SupabaseClient, state: ManagementReportState) {
  const { data, error } = await supabase.from("admin_settings").select("settings").eq("id", "default").maybeSingle();
  if (error) {
    if (isMissingRelation(error)) return false;
    throw error;
  }
  const settings = {
    ...((data?.settings ?? {}) as Record<string, unknown>),
    [SETTINGS_STORE_KEY]: { reports: sortNewest(state.reports) }
  };
  const { error: saveError } = await supabase
    .from("admin_settings")
    .upsert({ id: "default", settings, updated_at: new Date().toISOString() });
  if (saveError) {
    if (isMissingRelation(saveError)) return false;
    throw saveError;
  }
  return true;
}

async function loadState(supabase: SupabaseClient) {
  return (await loadStateFromAdminSettings(supabase)) ?? emptyState();
}

async function saveState(supabase: SupabaseClient, state: ManagementReportState) {
  if (await saveStateToAdminSettings(supabase, state)) return;
  throw new Error("Management report storage is not available.");
}

function trimField(value: unknown, max = MAX_FIELD_LENGTH) {
  return String(value ?? "").trim().slice(0, max);
}

function matchesCreator(report: ManagementReport, actor?: string | null) {
  if (!actor) return false;
  const normalized = actor.trim().toLowerCase();
  return (report.created_by ?? "").trim().toLowerCase() === normalized;
}

export async function listManagementReports(supabase: SupabaseClient, limit = 50): Promise<ManagementReport[]> {
  const state = await loadState(supabase);
  return sortNewest(state.reports).slice(0, limit);
}

export async function listWriteUpsForCreator(supabase: SupabaseClient, actor: string, limit = 50): Promise<ManagementReport[]> {
  const state = await loadState(supabase);
  return sortNewest(state.reports)
    .filter((report) => report.report_type === "employee_write_up" && matchesCreator(report, actor))
    .slice(0, limit);
}

export async function createDogHandlerComplaintReport(
  supabase: SupabaseClient,
  input: {
    dogHandlerName: string;
    summary: string;
    pushNoticeId: string;
    actor: string | null;
  }
): Promise<ManagementReport> {
  const dog_handler_name = input.dogHandlerName.trim().slice(0, MAX_NAME_LENGTH);
  const summary = input.summary.trim().slice(0, MAX_SUMMARY_LENGTH);
  if (!dog_handler_name) throw new Error("Dog handler name is required.");

  const now = new Date().toISOString();
  const report: ManagementReport = {
    id: newId(),
    report_type: "owner_complaint_dog_handler",
    title: "Owner Complaint - Dog Handler",
    dog_handler_name,
    employee_name: null,
    summary,
    write_up_details: null,
    source: "push_notice",
    status: "Needs Review",
    visibility: "admin_management",
    push_notice_id: input.pushNoticeId,
    related_notes: null,
    reviewed_by: null,
    reviewed_at: null,
    created_by: input.actor,
    created_at: now,
    updated_at: now
  };

  const state = await loadState(supabase);
  await saveState(supabase, { reports: sortNewest([report, ...state.reports]) });
  return report;
}

export type CreateEmployeeWriteUpInput = {
  employee_name: string;
  employee_department: string;
  incident_date: string;
  incident_time?: string | null;
  shift_location?: string | null;
  policy_violated?: string | null;
  incident_description: string;
  witnesses?: string | null;
  prior_discussion?: string | null;
  corrective_action?: string | null;
  team_lead_signature?: string | null;
};

export async function createEmployeeWriteUpReport(
  supabase: SupabaseClient,
  input: CreateEmployeeWriteUpInput,
  actor: string | null
): Promise<ManagementReport> {
  const employee_name = trimField(input.employee_name, MAX_NAME_LENGTH);
  const employee_department = trimField(input.employee_department, 80);
  const incident_date = trimField(input.incident_date, 32);
  const incident_description = trimField(input.incident_description, MAX_FIELD_LENGTH);

  if (!employee_name) throw new Error("Employee name is required.");
  if (!employee_department) throw new Error("Employee department is required.");
  if (!incident_date) throw new Error("Incident date is required.");
  if (!incident_description) throw new Error("Incident description is required.");

  const write_up_details: EmployeeWriteUpDetails = {
    employee_name,
    employee_department,
    incident_date,
    incident_time: trimField(input.incident_time, 40) || null,
    shift_location: trimField(input.shift_location, 120) || null,
    policy_violated: trimField(input.policy_violated, 240) || null,
    incident_description,
    witnesses: trimField(input.witnesses, 400) || null,
    prior_discussion: trimField(input.prior_discussion, 600) || null,
    corrective_action: trimField(input.corrective_action, 600) || null,
    team_lead_signature: trimField(input.team_lead_signature, 120) || actor
  };

  const summary = `${employee_name} (${employee_department}) — ${incident_description.slice(0, 180)}`;
  const now = new Date().toISOString();
  const report: ManagementReport = {
    id: newId(),
    report_type: "employee_write_up",
    title: `Employee Write-Up — ${employee_name}`,
    dog_handler_name: null,
    employee_name,
    summary: summary.slice(0, MAX_SUMMARY_LENGTH),
    write_up_details,
    source: "team_lead_form",
    status: "Needs Review",
    visibility: "admin_management",
    push_notice_id: null,
    related_notes: null,
    reviewed_by: null,
    reviewed_at: null,
    created_by: actor,
    created_at: now,
    updated_at: now
  };

  const state = await loadState(supabase);
  await saveState(supabase, { reports: sortNewest([report, ...state.reports]) });
  return report;
}
