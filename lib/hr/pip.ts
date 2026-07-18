type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export type PipStatus = "Active" | "On Hold" | "Completed" | "Cancelled";

export type PipPlan = {
  id: string;
  employee_name: string;
  employee_role: string | null;
  manager_name: string | null;
  focus_area: string;
  start_date: string;
  next_review_date: string | null;
  progress_percent: number;
  status: PipStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PipState = {
  plans: PipPlan[];
};

const SETTINGS_STORE_KEY = "hr_pip_plans";

function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `pip-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function clampProgress(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function normalizeStatus(value: unknown): PipStatus {
  if (value === "On Hold" || value === "Completed" || value === "Cancelled") return value;
  return "Active";
}

function normalizePlan(raw: unknown): PipPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<PipPlan>;
  const employee_name = String(row.employee_name ?? "").trim();
  const focus_area = String(row.focus_area ?? "").trim();
  if (!employee_name || !focus_area) return null;
  const now = new Date().toISOString();
  return {
    id: String(row.id || newId()),
    employee_name,
    employee_role: row.employee_role ? String(row.employee_role).trim() : null,
    manager_name: row.manager_name ? String(row.manager_name).trim() : null,
    focus_area,
    start_date: String(row.start_date || now.slice(0, 10)),
    next_review_date: row.next_review_date ? String(row.next_review_date).slice(0, 10) : null,
    progress_percent: clampProgress(row.progress_percent),
    status: normalizeStatus(row.status),
    notes: row.notes ? String(row.notes).slice(0, 2000) : null,
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at || now),
    updated_at: String(row.updated_at || now)
  };
}

function emptyState(): PipState {
  return { plans: [] };
}

function parseState(value: unknown): PipState {
  if (!value || typeof value !== "object") return emptyState();
  const plans = Array.isArray((value as { plans?: unknown }).plans)
    ? ((value as { plans: unknown[] }).plans).map(normalizePlan).filter((p): p is PipPlan => Boolean(p))
    : [];
  return {
    plans: plans.sort((a, b) => String(a.next_review_date || "9999").localeCompare(String(b.next_review_date || "9999")))
  };
}

function isMissingRelation(error: { code?: string; message?: string } | null) {
  return error?.code === "42P01" || /does not exist|relation/i.test(error?.message ?? "");
}

async function loadState(supabase: SupabaseClient): Promise<PipState> {
  const { data, error } = await supabase.from("admin_settings").select("settings").eq("id", "default").maybeSingle();
  if (error) {
    if (isMissingRelation(error)) return emptyState();
    throw error;
  }
  const settings = (data?.settings ?? {}) as Record<string, unknown>;
  return parseState(settings[SETTINGS_STORE_KEY]);
}

async function saveState(supabase: SupabaseClient, state: PipState) {
  const { data, error } = await supabase.from("admin_settings").select("settings").eq("id", "default").maybeSingle();
  if (error) {
    if (isMissingRelation(error)) throw new Error("PIP storage is not available.");
    throw error;
  }
  const settings = {
    ...((data?.settings ?? {}) as Record<string, unknown>),
    [SETTINGS_STORE_KEY]: { plans: state.plans }
  };
  const { error: saveError } = await supabase
    .from("admin_settings")
    .upsert({ id: "default", settings, updated_at: new Date().toISOString() });
  if (saveError) throw saveError;
}

export async function listPipPlans(supabase: SupabaseClient) {
  return (await loadState(supabase)).plans;
}

export async function createPipPlan(
  supabase: SupabaseClient,
  input: {
    employee_name: string;
    employee_role?: string | null;
    manager_name?: string | null;
    focus_area: string;
    start_date?: string;
    next_review_date?: string | null;
    progress_percent?: number;
    status?: PipStatus;
    notes?: string | null;
  },
  actor?: string | null
) {
  const state = await loadState(supabase);
  const now = new Date().toISOString();
  const plan = normalizePlan({
    ...input,
    id: newId(),
    created_by: actor ?? null,
    created_at: now,
    updated_at: now
  });
  if (!plan) throw new Error("Employee name and focus area are required.");
  state.plans.unshift(plan);
  await saveState(supabase, state);
  return plan;
}

export async function updatePipPlan(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<{
    employee_name: string;
    employee_role: string | null;
    manager_name: string | null;
    focus_area: string;
    start_date: string;
    next_review_date: string | null;
    progress_percent: number;
    status: PipStatus;
    notes: string | null;
  }>
) {
  const state = await loadState(supabase);
  const index = state.plans.findIndex((plan) => plan.id === id);
  if (index < 0) throw new Error("PIP plan not found.");
  const current = state.plans[index]!;
  const next = normalizePlan({
    ...current,
    ...patch,
    id: current.id,
    created_at: current.created_at,
    created_by: current.created_by,
    updated_at: new Date().toISOString()
  });
  if (!next) throw new Error("Invalid PIP plan update.");
  state.plans[index] = next;
  await saveState(supabase, state);
  return next;
}

export function pipReviewsDueThisWeek(plans: PipPlan[], now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return plans.filter((plan) => {
    if (plan.status !== "Active") return false;
    if (!plan.next_review_date) return false;
    const review = new Date(`${plan.next_review_date}T12:00:00`);
    return review >= start && review <= end;
  });
}

export function activePipPlans(plans: PipPlan[]) {
  return plans.filter((plan) => plan.status === "Active" || plan.status === "On Hold");
}
