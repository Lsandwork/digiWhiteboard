type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

import type { LiveBoardResponse } from "@/lib/types";
import {
  buildDemoGroomingNotice,
  buildDemoGroomingNoticeFromFields,
  buildDemoLiveDog,
  buildInitialDemoSandbox,
  type DemoPushAction,
  type DemoSandbox
} from "@/lib/demo/constants";
import {
  applyDemoStaffPushAction,
  deleteDemoStaffNotice,
  demoStaffPushBoardState,
  pushDemoStaffNoticeById,
  updateDemoStaffNotice
} from "@/lib/demo/staff-push";
import {
  normalizeGroomingPushNoticeInput,
  type GroomingPushNotice,
  type GroomingPushNoticeInput
} from "@/lib/staff/grooming-push-notices";

const SETTINGS_KEY = "demo_sandbox";

function isMissingRelation(error: { code?: string; message?: string } | null) {
  return error?.code === "42P01" || error?.code === "PGRST205" || Boolean(error?.message?.includes("schema cache"));
}

function parseSandbox(value: unknown): DemoSandbox {
  if (!value || typeof value !== "object") return buildInitialDemoSandbox();
  const raw = value as Partial<DemoSandbox>;
  const baseline = buildInitialDemoSandbox();
  return {
    checking_in: Array.isArray(raw.checking_in) ? raw.checking_in : baseline.checking_in,
    checking_out: Array.isArray(raw.checking_out) ? raw.checking_out : baseline.checking_out,
    grooming_notices: Array.isArray(raw.grooming_notices) ? raw.grooming_notices : [],
    staff_push_notices: Array.isArray(raw.staff_push_notices) ? raw.staff_push_notices : [],
    stats: raw.stats ?? baseline.stats,
    last_updated: raw.last_updated ?? new Date().toISOString()
  };
}

async function loadSandbox(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("admin_settings").select("settings").eq("id", "default").maybeSingle();
  if (error) {
    if (isMissingRelation(error)) return buildInitialDemoSandbox();
    throw error;
  }
  const settings = (data?.settings ?? {}) as Record<string, unknown>;
  return parseSandbox(settings[SETTINGS_KEY]);
}

async function saveSandbox(supabase: SupabaseClient, sandbox: DemoSandbox) {
  const { data, error } = await supabase.from("admin_settings").select("settings").eq("id", "default").maybeSingle();
  if (error) {
    if (isMissingRelation(error)) return false;
    throw error;
  }
  const settings = {
    ...((data?.settings ?? {}) as Record<string, unknown>),
    [SETTINGS_KEY]: sandbox
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

export async function getDemoSandbox(supabase: SupabaseClient) {
  return loadSandbox(supabase);
}

export async function resetDemoSandbox(supabase: SupabaseClient) {
  const sandbox = buildInitialDemoSandbox();
  if (!(await saveSandbox(supabase, sandbox))) {
    throw new Error("Demo sandbox storage is not available.");
  }
  return sandbox;
}

export function demoSandboxToBoard(sandbox: DemoSandbox): LiveBoardResponse {
  const activeGrooming = sandbox.grooming_notices.filter((notice) => notice.status === "active").length;
  return {
    checking_in: sandbox.checking_in,
    checking_out: sandbox.checking_out,
    counts: {
      checking_in: sandbox.checking_in.length,
      checking_out: sandbox.checking_out.length,
      total: sandbox.checking_in.length + sandbox.checking_out.length
    },
    last_updated: sandbox.last_updated,
    debug: {
      mode: "fast_internal",
      data_source: "demo_sandbox",
      grooming_active: activeGrooming
    } as LiveBoardResponse["debug"]
  };
}

export async function applyDemoPush(
  supabase: SupabaseClient,
  action: DemoPushAction,
  dogName: string,
  actor: string | null
) {
  const sandbox = await loadSandbox(supabase);
  const now = new Date().toISOString();
  const trimmed = dogName.trim() || "Max Smith";
  const dogKey = trimmed.toLowerCase();

  if (action === "check_in") {
    const dog = buildDemoLiveDog(trimmed, "checking_in");
    sandbox.checking_in = [dog, ...sandbox.checking_in.filter((d) => d.id !== dog.id)].slice(0, 8);
    sandbox.checking_out = sandbox.checking_out.filter(
      (d) => !`${d.animal_name} ${d.owner_name}`.trim().toLowerCase().includes(dogKey.split(" ")[0] ?? dogKey)
    );
    sandbox.stats.dogs_checked_in_today += 1;
    sandbox.stats.active_daycare += 1;
  }

  if (action === "check_out") {
    const dog = buildDemoLiveDog(trimmed, "checking_out");
    sandbox.checking_out = [dog, ...sandbox.checking_out.filter((d) => d.id !== dog.id)].slice(0, 8);
    sandbox.checking_in = sandbox.checking_in.filter(
      (d) => !`${d.animal_name} ${d.owner_name}`.trim().toLowerCase().includes(dogKey.split(" ")[0] ?? dogKey)
    );
    sandbox.stats.dogs_checked_out_today += 1;
    sandbox.stats.active_daycare = Math.max(0, sandbox.stats.active_daycare - 1);
  }

  if (action === "grooming") {
    sandbox.grooming_notices = [
      buildDemoGroomingNotice(trimmed, actor),
      ...sandbox.grooming_notices.filter((notice) => notice.status !== "active")
    ].slice(0, 10);
    sandbox.stats.grooming_queue += 1;
  }

  sandbox.last_updated = now;
  if (!(await saveSandbox(supabase, sandbox))) {
    throw new Error("Demo sandbox storage is not available.");
  }
  return sandbox;
}

export async function clearDemoGroomingNotice(supabase: SupabaseClient, id: string) {
  const sandbox = await loadSandbox(supabase);
  sandbox.grooming_notices = sandbox.grooming_notices.map((notice) =>
    notice.id === id
      ? { ...notice, status: "cleared" as const, cleared_at: new Date().toISOString(), cleared_by: "demo" }
      : notice
  );
  sandbox.stats.grooming_queue = Math.max(0, sandbox.stats.grooming_queue - 1);
  sandbox.last_updated = new Date().toISOString();
  await saveSandbox(supabase, sandbox);
  return sandbox;
}

function sortActiveGroomingNotices(notices: GroomingPushNotice[]) {
  return [...notices]
    .filter((notice) => notice.status === "active")
    .sort((a, b) => new Date(a.requested_at).getTime() - new Date(b.requested_at).getTime());
}

function isActiveGroomingNotice(notice: GroomingPushNotice, now = Date.now()) {
  if (notice.status !== "active") return false;
  const expiresAt = new Date(notice.expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt > now;
}

export function demoGroomingPushBoardState(sandbox: DemoSandbox) {
  const now = Date.now();
  const active = sortActiveGroomingNotices(sandbox.grooming_notices).filter((notice) =>
    isActiveGroomingNotice(notice, now)
  );
  return {
    activeNotice: active[0] ?? null,
    queue: active.slice(1, 4)
  };
}

export function demoRecentGroomingNotices(sandbox: DemoSandbox, limit = 20) {
  return [...sandbox.grooming_notices]
    .sort((a, b) => new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime())
    .slice(0, limit);
}

export async function applyDemoGroomingPushNotice(
  supabase: SupabaseClient,
  input: GroomingPushNoticeInput,
  actor: string | null
) {
  const normalized = normalizeGroomingPushNoticeInput(input);
  const notice = buildDemoGroomingNoticeFromFields(normalized, actor);
  const sandbox = await loadSandbox(supabase);
  sandbox.grooming_notices = [notice, ...sandbox.grooming_notices.filter((item) => item.status !== "active")].slice(
    0,
    10
  );
  sandbox.stats.grooming_queue += 1;
  sandbox.last_updated = new Date().toISOString();
  if (!(await saveSandbox(supabase, sandbox))) {
    throw new Error("Demo sandbox storage is not available.");
  }
  return { sandbox, notice, ...demoGroomingPushBoardState(sandbox) };
}

export async function applyDemoStaffPush(
  supabase: SupabaseClient,
  body: Record<string, unknown>,
  actor: string | null
) {
  const sandbox = await loadSandbox(supabase);
  const result = applyDemoStaffPushAction(sandbox, body, actor);
  if (!(await saveSandbox(supabase, result.sandbox))) {
    throw new Error("Demo sandbox storage is not available.");
  }
  return { ...result, ...demoStaffPushBoardState(result.sandbox) };
}

export async function pushDemoStaffNoticeAgain(
  supabase: SupabaseClient,
  id: string,
  actor: string | null
) {
  const sandbox = await loadSandbox(supabase);
  const result = pushDemoStaffNoticeById(sandbox, id, actor);
  if (!(await saveSandbox(supabase, result.sandbox))) {
    throw new Error("Demo sandbox storage is not available.");
  }
  return result;
}

export async function updateDemoStaffPushNotice(
  supabase: SupabaseClient,
  id: string,
  body: Record<string, unknown>,
  actor: string | null
) {
  const sandbox = await loadSandbox(supabase);
  const result = updateDemoStaffNotice(sandbox, id, body, actor);
  if (!(await saveSandbox(supabase, result.sandbox))) {
    throw new Error("Demo sandbox storage is not available.");
  }
  return result;
}

export async function removeDemoStaffPushNotice(supabase: SupabaseClient, id: string) {
  const sandbox = await loadSandbox(supabase);
  const next = deleteDemoStaffNotice(sandbox, id);
  if (!(await saveSandbox(supabase, next))) {
    throw new Error("Demo sandbox storage is not available.");
  }
  return next;
}

export function getDemoActiveStaffPushNotice(sandbox: DemoSandbox) {
  return demoStaffPushBoardState(sandbox).activeNotice;
}
