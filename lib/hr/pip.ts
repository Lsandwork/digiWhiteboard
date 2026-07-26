type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export type PipStatus = "Active" | "On Hold" | "Completed" | "Cancelled";

export type PipStage =
  | "Draft"
  | "Pending Employee Review"
  | "Stage 1"
  | "Stage 2"
  | "Stage 3"
  | "Final Review"
  | "Successfully Completed"
  | "Closed Unsuccessful"
  | "Cancelled"
  | "Archived";

export type PipRiskLevel = "Low" | "Medium" | "High" | "Critical";

export type PipDocumentationStatus =
  | "Complete"
  | "Incomplete"
  | "Missing Employee Acknowledgment"
  | "Missing Manager Review"
  | "Missing Supporting File"
  | "Overdue Review";

export type PipCheckIn = {
  id: string;
  date: string;
  note: string;
  progress_percent: number;
  created_by: string | null;
  created_at: string;
};

export type PipPlan = {
  id: string;
  employee_name: string;
  employee_role: string | null;
  manager_name: string | null;
  title: string | null;
  stage: PipStage;
  risk_level: PipRiskLevel;
  documentation_status: PipDocumentationStatus;
  focus_area: string;
  /** Clear, measurable goals the employee is working toward. */
  goals: string[];
  /** What “success” looks like by the end of the plan. */
  success_metrics: string | null;
  /** Coaching, training, schedule flexibility, mentoring, etc. */
  support_offered: string | null;
  /** Warm summary a manager can share with the employee (tone: support, not punishment). */
  employee_facing_summary: string | null;
  /** Internal manager notes / documentation (employer-protective). */
  manager_notes: string | null;
  start_date: string;
  next_review_date: string | null;
  target_end_date: string | null;
  progress_percent: number;
  status: PipStatus;
  notes: string | null;
  source_record_ids: string[];
  check_ins: PipCheckIn[];
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

function normalizeStage(value: unknown, status: PipStatus): PipStage {
  const stages: PipStage[] = [
    "Draft",
    "Pending Employee Review",
    "Stage 1",
    "Stage 2",
    "Stage 3",
    "Final Review",
    "Successfully Completed",
    "Closed Unsuccessful",
    "Cancelled",
    "Archived"
  ];
  if (typeof value === "string" && stages.includes(value as PipStage)) return value as PipStage;
  if (status === "Completed") return "Successfully Completed";
  if (status === "Cancelled") return "Cancelled";
  if (status === "On Hold") return "Stage 1";
  return "Stage 1";
}

function normalizeRisk(value: unknown): PipRiskLevel {
  if (value === "Medium" || value === "High" || value === "Critical") return value;
  return "Low";
}

function normalizeDocStatus(value: unknown, plan: { next_review_date: string | null; check_ins: PipCheckIn[]; goals: string[] }): PipDocumentationStatus {
  const allowed: PipDocumentationStatus[] = [
    "Complete",
    "Incomplete",
    "Missing Employee Acknowledgment",
    "Missing Manager Review",
    "Missing Supporting File",
    "Overdue Review"
  ];
  if (typeof value === "string" && allowed.includes(value as PipDocumentationStatus)) {
    return value as PipDocumentationStatus;
  }
  if (plan.next_review_date) {
    const due = new Date(`${plan.next_review_date}T12:00:00`);
    if (due.getTime() < Date.now()) return "Overdue Review";
  }
  if (!plan.goals.length) return "Incomplete";
  if (!plan.check_ins.length) return "Missing Manager Review";
  return "Complete";
}

function normalizeStringList(value: unknown, max = 12): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, max);
}

function normalizeCheckIns(value: unknown): PipCheckIn[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      if (!raw || typeof raw !== "object") return null;
      const row = raw as Partial<PipCheckIn>;
      const note = String(row.note ?? "").trim();
      if (!note) return null;
      const now = new Date().toISOString();
      return {
        id: String(row.id || newId()),
        date: String(row.date || now.slice(0, 10)).slice(0, 10),
        note: note.slice(0, 4000),
        progress_percent: clampProgress(row.progress_percent),
        created_by: row.created_by ? String(row.created_by) : null,
        created_at: String(row.created_at || now)
      } satisfies PipCheckIn;
    })
    .filter((row): row is PipCheckIn => Boolean(row))
    .slice(0, 40);
}

function normalizePlan(raw: unknown): PipPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<PipPlan> & { notes?: string | null };
  const employee_name = String(row.employee_name ?? "").trim();
  const focus_area = String(row.focus_area ?? "").trim();
  if (!employee_name || !focus_area) return null;
  const now = new Date().toISOString();
  const legacyNotes = row.notes ? String(row.notes).slice(0, 4000) : null;
  const status = normalizeStatus(row.status);
  const check_ins = normalizeCheckIns(row.check_ins);
  const goals = normalizeStringList(row.goals);
  const next_review_date = row.next_review_date ? String(row.next_review_date).slice(0, 10) : null;
  return {
    id: String(row.id || newId()),
    employee_name,
    employee_role: row.employee_role ? String(row.employee_role).trim() : null,
    manager_name: row.manager_name ? String(row.manager_name).trim() : null,
    title: row.title ? String(row.title).trim().slice(0, 160) : null,
    stage: normalizeStage(row.stage, status),
    risk_level: normalizeRisk(row.risk_level),
    documentation_status: normalizeDocStatus(row.documentation_status, {
      next_review_date,
      check_ins,
      goals
    }),
    focus_area,
    goals,
    success_metrics: row.success_metrics ? String(row.success_metrics).slice(0, 2000) : null,
    support_offered: row.support_offered ? String(row.support_offered).slice(0, 2000) : null,
    employee_facing_summary: row.employee_facing_summary
      ? String(row.employee_facing_summary).slice(0, 3000)
      : null,
    manager_notes: row.manager_notes
      ? String(row.manager_notes).slice(0, 4000)
      : legacyNotes,
    start_date: String(row.start_date || now.slice(0, 10)).slice(0, 10),
    next_review_date,
    target_end_date: row.target_end_date ? String(row.target_end_date).slice(0, 10) : null,
    progress_percent: clampProgress(row.progress_percent),
    status,
    notes: legacyNotes,
    source_record_ids: normalizeStringList(row.source_record_ids, 40),
    check_ins,
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at || now),
    updated_at: String(row.updated_at || now)
  };
}

function emptyState(): PipState {
  return { plans: [] };
}

/** Normalize employee labels so "Anderson" and "Anderson (Callum Dog owner)" match. */
export function normalizePipEmployeeKey(name: string) {
  return String(name || "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function preferEmployeeDisplayName(names: string[]) {
  const cleaned = names.map((name) => name.trim()).filter(Boolean);
  if (!cleaned.length) return "Team member";
  // Prefer the shortest name without parenthetical aliases.
  const withoutParens = cleaned.filter((name) => !/\(/.test(name));
  const pool = withoutParens.length ? withoutParens : cleaned;
  return [...pool].sort((a, b) => a.length - b.length || a.localeCompare(b))[0]!;
}

function pickPreferredText(...values: Array<string | null | undefined>) {
  return values.map((value) => (value ? String(value).trim() : "")).find(Boolean) || null;
}

function isOpenPipStatus(status: PipStatus) {
  return status === "Active" || status === "On Hold";
}

function mergeOpenPipGroup(group: PipPlan[]): PipPlan {
  const ordered = [...group].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const primary = ordered[0]!;
  if (ordered.length === 1) return primary;

  const names = [...new Set(ordered.map((plan) => plan.employee_name.trim()).filter(Boolean))];
  const focuses = [...new Set(ordered.map((plan) => plan.focus_area.trim()).filter(Boolean))];
  const goals = [...new Set(ordered.flatMap((plan) => plan.goals))];
  const sourceIds = [...new Set(ordered.flatMap((plan) => plan.source_record_ids))];
  const checkIns = [...ordered.flatMap((plan) => plan.check_ins)].sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  );
  const status = ordered.find((plan) => plan.status === "Active")?.status ?? ordered[0]!.status;
  const progress = Math.max(...ordered.map((plan) => plan.progress_percent), 0);

  const noteParts = [
    ...ordered.map((plan) => plan.manager_notes).filter(Boolean),
    names.length > 1 ? `Merged duplicate PIP entries for the same employee (${names.join(" · ")}).` : null,
    focuses.length > 1 ? `Combined focus areas:\n- ${focuses.join("\n- ")}` : null
  ].filter(Boolean);

  return (
    normalizePlan({
      ...primary,
      employee_name: preferEmployeeDisplayName(names),
      employee_role: pickPreferredText(...ordered.map((plan) => plan.employee_role)),
      manager_name: pickPreferredText(...ordered.map((plan) => plan.manager_name)),
      title: pickPreferredText(...ordered.map((plan) => plan.title)),
      stage: ordered.find((plan) => plan.stage)?.stage ?? primary.stage,
      risk_level: ordered.some((plan) => plan.risk_level === "Critical")
        ? "Critical"
        : ordered.some((plan) => plan.risk_level === "High")
          ? "High"
          : ordered.some((plan) => plan.risk_level === "Medium")
            ? "Medium"
            : primary.risk_level,
      focus_area: focuses.join(" | ").slice(0, 2000),
      goals,
      success_metrics: pickPreferredText(...ordered.map((plan) => plan.success_metrics)),
      support_offered: pickPreferredText(...ordered.map((plan) => plan.support_offered)),
      employee_facing_summary: pickPreferredText(...ordered.map((plan) => plan.employee_facing_summary)),
      manager_notes: noteParts.join("\n\n").slice(0, 4000),
      start_date: [...ordered.map((plan) => plan.start_date)].sort()[0] ?? primary.start_date,
      next_review_date:
        [...ordered.map((plan) => plan.next_review_date).filter(Boolean)].sort()[0] ?? primary.next_review_date,
      target_end_date:
        [...ordered.map((plan) => plan.target_end_date).filter(Boolean)].sort().at(-1) ?? primary.target_end_date,
      progress_percent: progress,
      status,
      source_record_ids: sourceIds,
      check_ins: checkIns.slice(0, 40),
      updated_at: new Date().toISOString()
    }) ?? primary
  );
}

/** Collapse multiple open PIP rows for the same employee into one plan. Closed plans stay separate. */
export function mergePipPlansByEmployee(plans: PipPlan[]): PipPlan[] {
  const closed: PipPlan[] = [];
  const openGroups = new Map<string, PipPlan[]>();

  for (const plan of plans) {
    if (!isOpenPipStatus(plan.status)) {
      closed.push(plan);
      continue;
    }
    const key = normalizePipEmployeeKey(plan.employee_name) || plan.id;
    const list = openGroups.get(key) ?? [];
    list.push(plan);
    openGroups.set(key, list);
  }

  const mergedOpen = [...openGroups.values()].map(mergeOpenPipGroup);
  return [...mergedOpen, ...closed].sort((a, b) =>
    String(a.next_review_date || "9999").localeCompare(String(b.next_review_date || "9999"))
  );
}

function parseState(value: unknown): PipState {
  if (!value || typeof value !== "object") return emptyState();
  const plans = Array.isArray((value as { plans?: unknown }).plans)
    ? ((value as { plans: unknown[] }).plans).map(normalizePlan).filter((p): p is PipPlan => Boolean(p))
    : [];
  return {
    plans: mergePipPlansByEmployee(plans)
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
  const rawPlans = Array.isArray((settings[SETTINGS_STORE_KEY] as { plans?: unknown } | undefined)?.plans)
    ? ((settings[SETTINGS_STORE_KEY] as { plans: unknown[] }).plans)
        .map(normalizePlan)
        .filter((plan): plan is PipPlan => Boolean(plan))
    : [];
  const merged = mergePipPlansByEmployee(rawPlans);
  // Persist dedupe so overview / command center stop showing duplicate employees.
  if (merged.length !== rawPlans.length || merged.some((plan, index) => plan.id !== rawPlans[index]?.id)) {
    await saveState(supabase, { plans: merged });
  }
  return { plans: merged };
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

export type PipPlanInput = {
  employee_name: string;
  employee_role?: string | null;
  manager_name?: string | null;
  title?: string | null;
  stage?: PipStage;
  risk_level?: PipRiskLevel;
  documentation_status?: PipDocumentationStatus;
  focus_area: string;
  goals?: string[];
  success_metrics?: string | null;
  support_offered?: string | null;
  employee_facing_summary?: string | null;
  manager_notes?: string | null;
  start_date?: string;
  next_review_date?: string | null;
  target_end_date?: string | null;
  progress_percent?: number;
  status?: PipStatus;
  notes?: string | null;
  source_record_ids?: string[];
};

export async function listPipPlans(supabase: SupabaseClient) {
  return (await loadState(supabase)).plans;
}

export async function createPipPlan(supabase: SupabaseClient, input: PipPlanInput, actor?: string | null) {
  const state = await loadState(supabase);
  const now = new Date().toISOString();
  const plan = normalizePlan({
    ...input,
    id: newId(),
    check_ins: [],
    created_by: actor ?? null,
    created_at: now,
    updated_at: now
  });
  if (!plan) throw new Error("Employee name and focus area are required.");

  const key = normalizePipEmployeeKey(plan.employee_name);
  const existingIndex = state.plans.findIndex(
    (row) =>
      (row.status === "Active" || row.status === "On Hold") &&
      normalizePipEmployeeKey(row.employee_name) === key
  );
  if (existingIndex >= 0) {
    const existing = state.plans[existingIndex]!;
    const merged = mergePipPlansByEmployee([existing, plan])[0]!;
    state.plans[existingIndex] = merged;
    state.plans = mergePipPlansByEmployee(state.plans);
    await saveState(supabase, state);
    return merged;
  }

  state.plans.unshift(plan);
  state.plans = mergePipPlansByEmployee(state.plans);
  await saveState(supabase, state);
  return plan;
}

export async function createPipPlansBulk(
  supabase: SupabaseClient,
  inputs: PipPlanInput[],
  actor?: string | null
) {
  const state = await loadState(supabase);
  const now = new Date().toISOString();
  const created: PipPlan[] = [];
  for (const input of inputs) {
    const plan = normalizePlan({
      ...input,
      id: newId(),
      check_ins: [],
      created_by: actor ?? null,
      created_at: now,
      updated_at: now
    });
    if (!plan) continue;
    const key = normalizePipEmployeeKey(plan.employee_name);
    const existingIndex = state.plans.findIndex(
      (row) =>
        (row.status === "Active" || row.status === "On Hold") &&
        normalizePipEmployeeKey(row.employee_name) === key
    );
    if (existingIndex >= 0) {
      const merged = mergePipPlansByEmployee([state.plans[existingIndex]!, plan])[0]!;
      state.plans[existingIndex] = merged;
      created.push(merged);
    } else {
      state.plans.unshift(plan);
      created.push(plan);
    }
  }
  if (!created.length) throw new Error("No valid PIP plans to create. Each needs an employee name and focus area.");
  state.plans = mergePipPlansByEmployee(state.plans);
  await saveState(supabase, state);
  return created;
}

export async function updatePipPlan(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<PipPlanInput> & { check_ins?: PipCheckIn[] }
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

export async function addPipCheckIn(
  supabase: SupabaseClient,
  planId: string,
  input: { note: string; date?: string; progress_percent?: number },
  actor?: string | null
) {
  const state = await loadState(supabase);
  const index = state.plans.findIndex((plan) => plan.id === planId);
  if (index < 0) throw new Error("PIP plan not found.");
  const current = state.plans[index]!;
  const now = new Date().toISOString();
  const checkIn: PipCheckIn = {
    id: newId(),
    date: String(input.date || now.slice(0, 10)).slice(0, 10),
    note: String(input.note || "").trim().slice(0, 4000),
    progress_percent: clampProgress(input.progress_percent ?? current.progress_percent),
    created_by: actor ?? null,
    created_at: now
  };
  if (!checkIn.note) throw new Error("Check-in note is required.");
  const next = normalizePlan({
    ...current,
    check_ins: [checkIn, ...current.check_ins],
    progress_percent: checkIn.progress_percent,
    updated_at: now
  });
  if (!next) throw new Error("Unable to add check-in.");
  state.plans[index] = next;
  await saveState(supabase, state);
  return next;
}

export async function deletePipPlan(supabase: SupabaseClient, id: string) {
  const state = await loadState(supabase);
  const next = state.plans.filter((plan) => plan.id !== id);
  if (next.length === state.plans.length) throw new Error("PIP plan not found.");
  await saveState(supabase, { plans: next });
  return { ok: true as const };
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

export function defaultNextReviewDate(from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
}

export function defaultTargetEndDate(from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() + 60);
  return d.toISOString().slice(0, 10);
}
