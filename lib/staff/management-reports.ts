type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export type ManagementReportStatus = "Open" | "Needs Review" | "Reviewed" | "Closed";

export type ManagementReport = {
  id: string;
  report_type: "owner_complaint_dog_handler";
  title: string;
  dog_handler_name: string;
  summary: string;
  source: "push_notice";
  status: ManagementReportStatus;
  visibility: "admin_management";
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

function parseState(value: unknown): ManagementReportState {
  if (!value || typeof value !== "object") return emptyState();
  const reports = Array.isArray((value as { reports?: unknown }).reports)
    ? ((value as { reports: ManagementReport[] }).reports)
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

export async function listManagementReports(supabase: SupabaseClient, limit = 50): Promise<ManagementReport[]> {
  const state = await loadState(supabase);
  return sortNewest(state.reports).slice(0, limit);
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
    summary,
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
