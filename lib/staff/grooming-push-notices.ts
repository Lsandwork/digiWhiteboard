type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export type GroomingPushNoticeStatus = "active" | "cleared" | "expired";

export type GroomingPushNotice = {
  id: string;
  dog_id: string | null;
  dog_name: string;
  dog_photo_url: string | null;
  owner_name: string | null;
  owner_initial: string | null;
  service: string;
  groomer_name: string;
  action: string;
  notes: string | null;
  safety_tags: string[];
  status: GroomingPushNoticeStatus;
  requested_by: string | null;
  requested_at: string;
  expires_at: string;
  cleared_at: string | null;
  cleared_by: string | null;
  created_at: string;
  updated_at: string;
  gingr_display_status?: string | null;
  user_notes?: string | null;
};

export type GroomingPushNoticeInput = {
  dog_id?: unknown;
  dog_name?: unknown;
  dog_photo_url?: unknown;
  owner_name?: unknown;
  owner_initial?: unknown;
  service?: unknown;
  groomer_name?: unknown;
  action?: unknown;
  notes?: unknown;
  safety_tags?: unknown;
  requested_by?: unknown;
  gingr_display_status?: unknown;
  reservation_id?: unknown;
  appointment_id?: unknown;
  manual_override?: unknown;
};

export type GroomingDogOption = {
  id: string;
  gingr_animal_id: string | null;
  dog_name: string;
  owner_name: string | null;
  photo_url: string | null;
};

export const GROOMING_SERVICE_OPTIONS = [
  "Bath",
  "Bath + Brush",
  "Deshed",
  "Nail Trim",
  "Grooming",
  "Brush Out",
  "Ear Cleaning",
  "Custom"
] as const;

export const GROOMING_SAFETY_TAG_OPTIONS = [
  "Use slip lead",
  "Nervous with dryer",
  "Needs two handlers",
  "Do not kennel",
  "Senior dog",
  "Medical note"
] as const;

export const GROOMING_NOTICE_DURATION_MS = 5 * 60 * 1000;
const SETTINGS_STORE_KEY = "grooming_push_notices";

function isMissingRelation(error: { code?: string; message?: string } | null) {
  return error?.code === "42P01" || error?.code === "PGRST205" || Boolean(error?.message?.includes("grooming_push_notices"));
}

function newNoticeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `grooming-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sanitizeText(value: unknown, maxLength: number) {
  return String(value ?? "")
    .replace(/[<>&"'`/\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function sanitizeTags(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => sanitizeText(value, 80)).filter(Boolean))];
}

function ownerInitialFromName(ownerName: string | null) {
  if (!ownerName) return null;
  const parts = ownerName.trim().split(/\s+/);
  if (!parts.length) return null;
  return parts[0].charAt(0).toUpperCase();
}

/** Derive a display groomer name from the logged-in user when the form does not ask for one. */
export function groomerNameFromActor(actor?: string | null) {
  const raw = String(actor ?? "").trim();
  if (!raw) return "Grooming";
  if (raw.includes("@")) {
    const local = raw.split("@")[0] ?? "";
    const parts = local.split(/[._-]+/).filter(Boolean);
    if (!parts.length) return "Grooming";
    return parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ").slice(0, 80);
  }
  return raw.slice(0, 80);
}

const GINGR_META_RE = /^@@GINGR_META:([\s\S]*?)@@\n?/;

export function parseGingrNoticeMeta(notes: string | null | undefined) {
  if (!notes) return { displayStatus: null as string | null, userNotes: null as string | null };
  const match = notes.match(GINGR_META_RE);
  if (!match) return { displayStatus: null, userNotes: notes };
  try {
    const meta = JSON.parse(match[1]!) as { displayStatus?: string };
    const userNotes = notes.replace(GINGR_META_RE, "").trim();
    return {
      displayStatus: meta.displayStatus ?? null,
      userNotes: userNotes || null
    };
  } catch {
    return { displayStatus: null, userNotes: notes };
  }
}

export function packGingrNoticeNotes(displayStatus: string | null | undefined, userNotes: string | null | undefined) {
  const cleanNotes = sanitizeText(userNotes, 400) || null;
  const cleanStatus = sanitizeText(displayStatus, 120) || null;
  if (!cleanStatus) return cleanNotes;
  const meta = `@@GINGR_META:${JSON.stringify({ displayStatus: cleanStatus })}@@`;
  return cleanNotes ? `${meta}\n${cleanNotes}` : meta;
}

function normalizeNoticeRow(row: Record<string, unknown>): GroomingPushNotice {
  const rawNotes = row.notes != null ? String(row.notes) : null;
  const { displayStatus, userNotes } = parseGingrNoticeMeta(rawNotes);
  return {
    id: String(row.id),
    dog_id: row.dog_id != null ? String(row.dog_id) : null,
    dog_name: String(row.dog_name ?? ""),
    dog_photo_url: row.dog_photo_url != null ? String(row.dog_photo_url) : null,
    owner_name: row.owner_name != null ? String(row.owner_name) : null,
    owner_initial: row.owner_initial != null ? String(row.owner_initial) : null,
    service: String(row.service ?? "Grooming"),
    groomer_name: String(row.groomer_name ?? ""),
    action: String(row.action ?? "Bring to Catch"),
    notes: rawNotes,
    safety_tags: Array.isArray(row.safety_tags) ? row.safety_tags.map(String) : [],
    status: (row.status === "cleared" || row.status === "expired" ? row.status : "active") as GroomingPushNoticeStatus,
    requested_by: row.requested_by != null ? String(row.requested_by) : null,
    requested_at: String(row.requested_at ?? new Date().toISOString()),
    expires_at: String(row.expires_at ?? new Date().toISOString()),
    cleared_at: row.cleared_at != null ? String(row.cleared_at) : null,
    cleared_by: row.cleared_by != null ? String(row.cleared_by) : null,
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
    gingr_display_status: displayStatus,
    user_notes: userNotes
  };
}

function isActiveNotice(notice: GroomingPushNotice, now = Date.now()) {
  if (notice.status !== "active") return false;
  const expiresAt = new Date(notice.expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt > now;
}

function sortActiveNotices(notices: GroomingPushNotice[]) {
  return [...notices]
    .filter((notice) => notice.status === "active")
    .sort((a, b) => new Date(a.requested_at).getTime() - new Date(b.requested_at).getTime());
}

type GroomingNoticeState = { notices: GroomingPushNotice[] };

async function loadFallbackState(supabase: SupabaseClient): Promise<GroomingNoticeState> {
  const { data, error } = await supabase.from("admin_settings").select("settings").eq("id", "default").maybeSingle();
  if (error) return { notices: [] };
  const settings = (data?.settings ?? {}) as Record<string, unknown>;
  const raw = settings[SETTINGS_STORE_KEY];
  if (!raw || typeof raw !== "object") return { notices: [] };
  const notices = Array.isArray((raw as { notices?: unknown }).notices)
    ? ((raw as { notices: GroomingPushNotice[] }).notices)
    : [];
  return { notices };
}

async function saveFallbackState(supabase: SupabaseClient, state: GroomingNoticeState) {
  const { data, error } = await supabase.from("admin_settings").select("settings").eq("id", "default").maybeSingle();
  if (error) return;
  const settings = {
    ...((data?.settings ?? {}) as Record<string, unknown>),
    [SETTINGS_STORE_KEY]: state
  };
  await supabase.from("admin_settings").upsert({ id: "default", settings, updated_at: new Date().toISOString() });
}

export function normalizeGroomingPushNoticeInput(input: GroomingPushNoticeInput, actor?: string | null) {
  const manualOverride = Boolean(input.manual_override);
  const dog_name = sanitizeText(input.dog_name, 80);
  const groomer_name = sanitizeText(input.groomer_name, 80) || groomerNameFromActor(actor);
  const service = sanitizeText(input.service, 80) || "Grooming";
  const owner_name = sanitizeText(input.owner_name, 80) || null;
  const owner_initial = sanitizeText(input.owner_initial, 4) || ownerInitialFromName(owner_name);
  const user_notes = sanitizeText(input.notes, 400) || null;
  const gingr_display_status = sanitizeText(input.gingr_display_status, 120) || null;
  const safety_tags = sanitizeTags(input.safety_tags);
  const dog_id =
    sanitizeText(input.dog_id, 120) ||
    sanitizeText(input.reservation_id, 120) ||
    sanitizeText(input.appointment_id, 120) ||
    null;

  if (!manualOverride && !dog_id) {
    throw new Error("Select a dog from the Gingr list before pushing this notice.");
  }
  if (!dog_name) throw new Error("Dog name is required.");
  if (!groomer_name) throw new Error("Groomer name is required.");

  return {
    dog_id,
    dog_name,
    dog_photo_url: sanitizeText(input.dog_photo_url, 500) || null,
    owner_name,
    owner_initial,
    service,
    groomer_name,
    action: sanitizeText(input.action, 80) || "Bring to Catch",
    notes: packGingrNoticeNotes(gingr_display_status, user_notes),
    safety_tags,
    requested_by: sanitizeText(input.requested_by, 120) || null
  };
}

export function formatGroomingCountdown(expiresAt: string | null | undefined, nowMs: number) {
  if (!expiresAt) return "05:00";
  const remainingSec = Math.max(0, Math.floor((new Date(expiresAt).getTime() - nowMs) / 1000));
  const minutes = Math.floor(remainingSec / 60);
  const seconds = remainingSec % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function groomingInstruction(_notice: Pick<GroomingPushNotice, "dog_name">) {
  return "PUT DOG IN CATCH FOR GROOMER. PLEASE USE SLIP LEAD.";
}

export function groomingStatusLabel(notice: Pick<GroomingPushNotice, "gingr_display_status" | "status">) {
  const label = notice.gingr_display_status?.trim();
  if (!label) return null;
  if (label.toLowerCase().includes("checked in")) return "CHECKED IN TO GINGR";
  return label.toUpperCase();
}

export function ownerDisplayLabel(notice: Pick<GroomingPushNotice, "owner_name" | "owner_initial">) {
  if (notice.owner_name) return notice.owner_name;
  if (notice.owner_initial) return `Owner: ${notice.owner_initial}.`;
  return null;
}

/** "Jasper Sandoval" → dog Jasper, owner last name Sandoval */
export function parseDogAndOwnerLastName(input: string) {
  const trimmed = String(input ?? "").trim();
  if (!trimmed) return { dog_name: "", owner_name: null as string | null, owner_initial: null as string | null };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return {
      dog_name: parts[0]!,
      owner_name: null,
      owner_initial: null
    };
  }
  const owner_name = parts[parts.length - 1]!;
  const dog_name = parts.slice(0, -1).join(" ");
  return {
    dog_name,
    owner_name,
    owner_initial: owner_name.charAt(0).toUpperCase()
  };
}

export async function expireStaleGroomingPushNotices(supabase: SupabaseClient) {
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("grooming_push_notices")
    .update({ status: "expired", updated_at: nowIso })
    .eq("status", "active")
    .lte("expires_at", nowIso);

  if (error && isMissingRelation(error)) {
    const state = await loadFallbackState(supabase);
    const next = state.notices.map((notice) =>
      notice.status === "active" && new Date(notice.expires_at).getTime() <= Date.now()
        ? { ...notice, status: "expired" as const, updated_at: nowIso }
        : notice
    );
    await saveFallbackState(supabase, { notices: next });
    return;
  }
  if (error) throw error;
}

export async function loadGroomingPushBoardState(supabase: SupabaseClient) {
  await expireStaleGroomingPushNotices(supabase);
  const now = Date.now();

  const { data, error } = await supabase
    .from("grooming_push_notices")
    .select("*")
    .eq("status", "active")
    .gt("expires_at", new Date(now).toISOString())
    .order("requested_at", { ascending: true });

  if (error && isMissingRelation(error)) {
    const state = await loadFallbackState(supabase);
    const active = sortActiveNotices(state.notices).filter((notice) => isActiveNotice(notice, now));
    return {
      activeNotice: active[0] ?? null,
      queue: active.slice(1, 4)
    };
  }
  if (error) throw error;

  const notices = (data ?? []).map((row) => normalizeNoticeRow(row as Record<string, unknown>));
  return {
    activeNotice: notices[0] ?? null,
    queue: notices.slice(1, 4)
  };
}

export async function listRecentGroomingPushNotices(supabase: SupabaseClient, limit = 20) {
  await expireStaleGroomingPushNotices(supabase);
  const { data, error } = await supabase
    .from("grooming_push_notices")
    .select("*")
    .order("requested_at", { ascending: false })
    .limit(limit);

  if (error && isMissingRelation(error)) {
    const state = await loadFallbackState(supabase);
    return [...state.notices].sort((a, b) => new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime()).slice(0, limit);
  }
  if (error) throw error;
  return (data ?? []).map((row) => normalizeNoticeRow(row as Record<string, unknown>));
}

export async function loadGroomingDogOptions(supabase: SupabaseClient): Promise<GroomingDogOption[]> {
  const { data, error } = await supabase
    .from("live_transition_dogs")
    .select("id, gingr_animal_id, animal_name, owner_name, photo_url")
    .eq("hidden", false)
    .in("display_status", ["checking_in", "checking_out"])
    .order("animal_name", { ascending: true });

  if (error) return [];
  return (data ?? []).map((row) => ({
    id: String(row.id),
    gingr_animal_id: row.gingr_animal_id != null ? String(row.gingr_animal_id) : null,
    dog_name: String(row.animal_name ?? ""),
    owner_name: row.owner_name != null ? String(row.owner_name) : null,
    photo_url: row.photo_url != null ? String(row.photo_url) : null
  }));
}

export async function createGroomingPushNotice(
  supabase: SupabaseClient,
  input: GroomingPushNoticeInput,
  actor?: string | null
) {
  const { clearAllActiveCastVideos } = await import("@/lib/staff/cast-video-notices");
  await clearAllActiveCastVideos(supabase, actor);

  const normalized = normalizeGroomingPushNoticeInput(input, actor);
  const now = new Date();
  const requested_at = now.toISOString();
  const expires_at = new Date(now.getTime() + GROOMING_NOTICE_DURATION_MS).toISOString();

  const payload = {
    ...normalized,
    status: "active" as const,
    requested_by: normalized.requested_by ?? actor ?? null,
    requested_at,
    expires_at
  };

  const { data, error } = await supabase.from("grooming_push_notices").insert(payload).select("*").single();
  if (error && isMissingRelation(error)) {
    const state = await loadFallbackState(supabase);
    const notice: GroomingPushNotice = {
      id: newNoticeId(),
      ...payload,
      cleared_at: null,
      cleared_by: null,
      created_at: requested_at,
      updated_at: requested_at
    };
    await saveFallbackState(supabase, { notices: [notice, ...state.notices] });
    return notice;
  }
  if (error) throw error;
  return normalizeNoticeRow(data as Record<string, unknown>);
}

export async function clearGroomingPushNotice(
  supabase: SupabaseClient,
  id: string,
  actor?: string | null
) {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("grooming_push_notices")
    .update({ status: "cleared", cleared_at: nowIso, cleared_by: actor ?? null, updated_at: nowIso })
    .eq("id", id)
    .eq("status", "active")
    .select("*")
    .maybeSingle();

  if (error && isMissingRelation(error)) {
    const state = await loadFallbackState(supabase);
    let cleared: GroomingPushNotice | null = null;
    const next = state.notices.map((notice) => {
      if (notice.id !== id || notice.status !== "active") return notice;
      cleared = { ...notice, status: "cleared", cleared_at: nowIso, cleared_by: actor ?? null, updated_at: nowIso };
      return cleared;
    });
    await saveFallbackState(supabase, { notices: next });
    if (!cleared) throw new Error("Grooming push notice not found.");
    return cleared;
  }
  if (error) throw error;
  if (!data) throw new Error("Grooming push notice not found.");
  return normalizeNoticeRow(data as Record<string, unknown>);
}
