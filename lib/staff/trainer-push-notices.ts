type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export type TrainerPushNoticeStatus = "active" | "cleared" | "expired";

export type TrainerPushNotice = {
  id: string;
  dog_id: string | null;
  dog_name: string;
  dog_photo_url: string | null;
  owner_name: string | null;
  owner_initial: string | null;
  service: string;
  trainer_name: string;
  action: string;
  notes: string | null;
  safety_tags: string[];
  status: TrainerPushNoticeStatus;
  requested_by: string | null;
  requested_at: string;
  expires_at: string;
  cleared_at: string | null;
  cleared_by: string | null;
  created_at: string;
  updated_at: string;
};

export type TrainerPushNoticeInput = {
  dog_id?: unknown;
  dog_name?: unknown;
  dog_photo_url?: unknown;
  owner_name?: unknown;
  owner_initial?: unknown;
  service?: unknown;
  trainer_name?: unknown;
  action?: unknown;
  notes?: unknown;
  safety_tags?: unknown;
  requested_by?: unknown;
};

export type TrainerDogOption = {
  id: string;
  gingr_animal_id: string | null;
  dog_name: string;
  owner_name: string | null;
  photo_url: string | null;
};

export const TRAINER_SERVICE_OPTIONS = [
  "Private Training",
  "Group Class",
  "Assessment",
  "Behavior Consult",
  "Day Training",
  "Puppy Class",
  "Custom"
] as const;

export const TRAINER_SAFETY_TAG_OPTIONS = [
  "Reactive on leash",
  "Needs two handlers",
  "Food motivated only",
  "No other dogs nearby",
  "Senior dog",
  "Medical note"
] as const;

export const TRAINER_NOTICE_DURATION_MS = 5 * 60 * 1000;
const SETTINGS_STORE_KEY = "trainer_push_notices";

function newNoticeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `trainer-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

function isActiveNotice(notice: TrainerPushNotice, now = Date.now()) {
  if (notice.status !== "active") return false;
  const expiresAt = new Date(notice.expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt > now;
}

function sortActiveNotices(notices: TrainerPushNotice[]) {
  return [...notices]
    .filter((notice) => notice.status === "active")
    .sort((a, b) => new Date(a.requested_at).getTime() - new Date(b.requested_at).getTime());
}

type TrainerNoticeState = { notices: TrainerPushNotice[] };

async function loadState(supabase: SupabaseClient): Promise<TrainerNoticeState> {
  const { data, error } = await supabase.from("admin_settings").select("settings").eq("id", "default").maybeSingle();
  if (error) return { notices: [] };
  const settings = (data?.settings ?? {}) as Record<string, unknown>;
  const raw = settings[SETTINGS_STORE_KEY];
  if (!raw || typeof raw !== "object") return { notices: [] };
  const notices = Array.isArray((raw as { notices?: unknown }).notices)
    ? ((raw as { notices: TrainerPushNotice[] }).notices)
    : [];
  return { notices };
}

async function saveState(supabase: SupabaseClient, state: TrainerNoticeState) {
  const { data, error } = await supabase.from("admin_settings").select("settings").eq("id", "default").maybeSingle();
  if (error) return;
  const settings = {
    ...((data?.settings ?? {}) as Record<string, unknown>),
    [SETTINGS_STORE_KEY]: state
  };
  await supabase.from("admin_settings").upsert({ id: "default", settings, updated_at: new Date().toISOString() });
}

export function normalizeTrainerPushNoticeInput(input: TrainerPushNoticeInput) {
  const dog_name = sanitizeText(input.dog_name, 80);
  const trainer_name = sanitizeText(input.trainer_name, 80);
  const service = sanitizeText(input.service, 80) || "Training";
  const owner_name = sanitizeText(input.owner_name, 80) || null;
  const owner_initial = sanitizeText(input.owner_initial, 4) || ownerInitialFromName(owner_name);
  const notes = sanitizeText(input.notes, 400) || null;
  const safety_tags = sanitizeTags(input.safety_tags);

  if (!dog_name) throw new Error("Dog name is required.");
  if (!trainer_name) throw new Error("Trainer name is required.");

  return {
    dog_id: sanitizeText(input.dog_id, 120) || null,
    dog_name,
    dog_photo_url: sanitizeText(input.dog_photo_url, 500) || null,
    owner_name,
    owner_initial,
    service,
    trainer_name,
    action: sanitizeText(input.action, 80) || "Bring to Training",
    notes,
    safety_tags,
    requested_by: sanitizeText(input.requested_by, 120) || null
  };
}

export function formatTrainerCountdown(expiresAt: string | null | undefined, nowMs: number) {
  if (!expiresAt) return "05:00";
  const remainingSec = Math.max(0, Math.floor((new Date(expiresAt).getTime() - nowMs) / 1000));
  const minutes = Math.floor(remainingSec / 60);
  const seconds = remainingSec % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function trainerInstruction(notice: Pick<TrainerPushNotice, "dog_name">) {
  return `Please bring ${notice.dog_name} to Training. Confirm transfer with trainer/front desk.`;
}

export function trainerOwnerDisplayLabel(notice: Pick<TrainerPushNotice, "owner_name" | "owner_initial">) {
  if (notice.owner_name) return notice.owner_name;
  if (notice.owner_initial) return `Owner: ${notice.owner_initial}.`;
  return null;
}

export async function expireStaleTrainerPushNotices(supabase: SupabaseClient) {
  const nowIso = new Date().toISOString();
  const state = await loadState(supabase);
  const next = state.notices.map((notice) =>
    notice.status === "active" && new Date(notice.expires_at).getTime() <= Date.now()
      ? { ...notice, status: "expired" as const, updated_at: nowIso }
      : notice
  );
  await saveState(supabase, { notices: next });
}

export async function loadTrainerPushBoardState(supabase: SupabaseClient) {
  await expireStaleTrainerPushNotices(supabase);
  const now = Date.now();
  const state = await loadState(supabase);
  const active = sortActiveNotices(state.notices).filter((notice) => isActiveNotice(notice, now));
  return {
    activeNotice: active[0] ?? null,
    queue: active.slice(1, 4)
  };
}

export async function listRecentTrainerPushNotices(supabase: SupabaseClient, limit = 20) {
  await expireStaleTrainerPushNotices(supabase);
  const state = await loadState(supabase);
  return [...state.notices]
    .sort((a, b) => new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime())
    .slice(0, limit);
}

export async function loadTrainerDogOptions(supabase: SupabaseClient): Promise<TrainerDogOption[]> {
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

export async function createTrainerPushNotice(
  supabase: SupabaseClient,
  input: TrainerPushNoticeInput,
  actor?: string | null
) {
  const { clearAllActiveCastVideos } = await import("@/lib/staff/cast-video-notices");
  await clearAllActiveCastVideos(supabase, actor);

  const normalized = normalizeTrainerPushNoticeInput(input);
  const now = new Date();
  const requested_at = now.toISOString();
  const expires_at = new Date(now.getTime() + TRAINER_NOTICE_DURATION_MS).toISOString();

  const payload = {
    ...normalized,
    status: "active" as const,
    requested_by: normalized.requested_by ?? actor ?? null,
    requested_at,
    expires_at
  };

  const state = await loadState(supabase);
  const notice: TrainerPushNotice = {
    id: newNoticeId(),
    ...payload,
    cleared_at: null,
    cleared_by: null,
    created_at: requested_at,
    updated_at: requested_at
  };
  await saveState(supabase, { notices: [notice, ...state.notices] });
  return notice;
}

export async function clearTrainerPushNotice(
  supabase: SupabaseClient,
  id: string,
  actor?: string | null
): Promise<TrainerPushNotice> {
  const nowIso = new Date().toISOString();
  const state = await loadState(supabase);
  let cleared: TrainerPushNotice | undefined;
  const next = state.notices.map((notice) => {
    if (notice.id !== id || notice.status !== "active") return notice;
    cleared = { ...notice, status: "cleared", cleared_at: nowIso, cleared_by: actor ?? null, updated_at: nowIso };
    return cleared;
  });
  await saveState(supabase, { notices: next });
  if (!cleared) throw new Error("Trainer push notice not found.");
  return cleared;
}
