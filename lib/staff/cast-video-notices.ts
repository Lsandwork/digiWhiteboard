type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export type CastVideoPriority = "normal" | "important" | "urgent" | "emergency";
export type CastVideoStatus = "draft" | "scheduled" | "active" | "cleared" | "expired" | "deleted";
export type CastVideoAutoClearMode = "manual" | "30s" | "1m" | "2m" | "5m" | "10m";

export type CastVideoDepartment =
  | "staff_whiteboard"
  | "dog_handlers"
  | "front_desk"
  | "grooming"
  | "team_leads"
  | "management"
  | "drivers"
  | "everyone";

export const CAST_VIDEO_DEPARTMENTS: { value: CastVideoDepartment; label: string }[] = [
  { value: "staff_whiteboard", label: "Staff Whiteboard" },
  { value: "dog_handlers", label: "Dog Handlers" },
  { value: "front_desk", label: "Front Desk" },
  { value: "grooming", label: "Grooming" },
  { value: "team_leads", label: "Team Leads" },
  { value: "management", label: "Management" },
  { value: "drivers", label: "Drivers" },
  { value: "everyone", label: "Everyone" }
];

export const CAST_VIDEO_PRIORITY_OPTIONS: { value: CastVideoPriority; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "important", label: "Important" },
  { value: "urgent", label: "Urgent" },
  { value: "emergency", label: "Emergency" }
];

export const CAST_VIDEO_AUTO_CLEAR_OPTIONS: { value: CastVideoAutoClearMode; label: string }[] = [
  { value: "manual", label: "Stay until manually cleared" },
  { value: "30s", label: "Auto clear after 30 sec" },
  { value: "1m", label: "Auto clear after 1 min" },
  { value: "2m", label: "Auto clear after 2 min" },
  { value: "5m", label: "Auto clear after 5 min" },
  { value: "10m", label: "Auto clear after 10 min" }
];

export const CAST_VIDEO_MAX_BYTES = 250 * 1024 * 1024;
export const CAST_VIDEO_BUCKET = "cast-videos";
export const CAST_VIDEO_ALLOWED_MIME = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime"
]);

export type CastVideoNotice = {
  id: string;
  title: string;
  description: string | null;
  priority: CastVideoPriority;
  departments: CastVideoDepartment[];
  video_storage_path: string | null;
  video_url: string | null;
  thumbnail_storage_path: string | null;
  thumbnail_url: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  allow_sound: boolean;
  require_acknowledgement: boolean;
  auto_clear_mode: CastVideoAutoClearMode;
  status: CastVideoStatus;
  scheduled_at: string | null;
  pushed_at: string | null;
  pushed_by: string | null;
  expires_at: string | null;
  cleared_at: string | null;
  cleared_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CastVideoView = {
  id: string;
  notice_id: string;
  viewer_key: string;
  viewer_role: string | null;
  viewer_location: string | null;
  opened_at: string;
  closed_at: string | null;
  watch_duration_ms: number | null;
  acknowledged: boolean;
  skipped: boolean;
  created_at: string;
  updated_at: string;
};

export type CastVideoNoticeInput = {
  title?: unknown;
  description?: unknown;
  priority?: unknown;
  departments?: unknown;
  video_storage_path?: unknown;
  video_url?: unknown;
  thumbnail_storage_path?: unknown;
  thumbnail_url?: unknown;
  mime_type?: unknown;
  file_size_bytes?: unknown;
  allow_sound?: unknown;
  require_acknowledgement?: unknown;
  auto_clear_mode?: unknown;
  scheduled_at?: unknown;
};

export type CastVideoViewStats = {
  viewed: number;
  pending: number;
  average_watch_ms: number;
};

const SETTINGS_STORE_KEY = "cast_video_notices";
const PRIORITY_RANK: Record<CastVideoPriority, number> = {
  emergency: 4,
  urgent: 3,
  important: 2,
  normal: 1
};

const AUTO_CLEAR_MS: Record<Exclude<CastVideoAutoClearMode, "manual">, number> = {
  "30s": 30_000,
  "1m": 60_000,
  "2m": 120_000,
  "5m": 300_000,
  "10m": 600_000
};

function isMissingRelation(error: { code?: string; message?: string } | null) {
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    Boolean(error?.message?.includes("cast_video_notices"))
  );
}

function newNoticeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `cast-video-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sanitizeText(value: unknown, maxLength: number) {
  return String(value ?? "")
    .replace(/[<>&"'`/\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function sanitizeUrl(value: unknown, maxLength: number) {
  const raw = String(value ?? "")
    .trim()
    .replace(/[<>"'`\\]/g, "")
    .slice(0, maxLength);
  if (!/^https?:\/\//i.test(raw)) return null;
  return raw;
}

function sanitizeMimeType(value: unknown) {
  const raw = String(value ?? "")
    .trim()
    .replace(/[<>&"'`\\]/g, "")
    .slice(0, 80);
  return raw || null;
}

function normalizePriority(value: unknown): CastVideoPriority {
  const raw = sanitizeText(value, 20).toLowerCase();
  if (raw === "emergency" || raw === "urgent" || raw === "important" || raw === "normal") return raw;
  return "normal";
}

function normalizeAutoClearMode(value: unknown): CastVideoAutoClearMode {
  const raw = sanitizeText(value, 10);
  if (raw === "30s" || raw === "1m" || raw === "2m" || raw === "5m" || raw === "10m" || raw === "manual") return raw;
  return "manual";
}

function normalizeDepartments(value: unknown): CastVideoDepartment[] {
  const allowed = new Set(CAST_VIDEO_DEPARTMENTS.map((item) => item.value));
  if (!Array.isArray(value) || !value.length) return ["everyone"];
  const departments = [...new Set(value.map((item) => sanitizeText(item, 40)).filter(Boolean))].filter(
    (item): item is CastVideoDepartment => allowed.has(item as CastVideoDepartment)
  );
  return departments.length ? departments : ["everyone"];
}

export function castVideoAutoClearMs(mode: CastVideoAutoClearMode) {
  if (mode === "manual") return null;
  return AUTO_CLEAR_MS[mode];
}

export function castVideoExpiresAtFromMode(mode: CastVideoAutoClearMode, from = new Date()) {
  const ms = castVideoAutoClearMs(mode);
  if (!ms) return null;
  return new Date(from.getTime() + ms).toISOString();
}

export function isEmergencyCastVideo(notice: Pick<CastVideoNotice, "priority">) {
  return notice.priority === "emergency";
}

export function isYouTubeEmbedCastVideo(
  notice: Pick<CastVideoNotice, "mime_type" | "video_url" | "description">
) {
  const mime = notice.mime_type ?? "";
  if (
    mime === "application/x-youtube-embed" ||
    mime === "applicationxyoutube-embed" ||
    mime === "youtube-embed"
  ) {
    return true;
  }
  if (String(notice.description ?? "").startsWith("yard_push:")) return true;
  return /youtube\.com\/embed\//i.test(notice.video_url ?? "");
}

export function castVideoTargetsDepartment(notice: Pick<CastVideoNotice, "departments">, department: string | null | undefined) {
  if (!department || department === "everyone") return true;
  if (notice.departments.includes("everyone")) return true;
  return notice.departments.includes(department as CastVideoDepartment);
}

function normalizeNoticeRow(row: Record<string, unknown>): CastVideoNotice {
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    description: row.description != null ? String(row.description) : null,
    priority: normalizePriority(row.priority),
    departments: normalizeDepartments(row.departments),
    video_storage_path: row.video_storage_path != null ? String(row.video_storage_path) : null,
    video_url: row.video_url != null ? String(row.video_url) : null,
    thumbnail_storage_path: row.thumbnail_storage_path != null ? String(row.thumbnail_storage_path) : null,
    thumbnail_url: row.thumbnail_url != null ? String(row.thumbnail_url) : null,
    mime_type: row.mime_type != null ? String(row.mime_type) : null,
    file_size_bytes: row.file_size_bytes != null ? Number(row.file_size_bytes) : null,
    allow_sound: Boolean(row.allow_sound),
    require_acknowledgement: Boolean(row.require_acknowledgement),
    auto_clear_mode: normalizeAutoClearMode(row.auto_clear_mode),
    status: (["draft", "scheduled", "active", "cleared", "expired", "deleted"].includes(String(row.status))
      ? String(row.status)
      : "draft") as CastVideoStatus,
    scheduled_at: row.scheduled_at != null ? String(row.scheduled_at) : null,
    pushed_at: row.pushed_at != null ? String(row.pushed_at) : null,
    pushed_by: row.pushed_by != null ? String(row.pushed_by) : null,
    expires_at: row.expires_at != null ? String(row.expires_at) : null,
    cleared_at: row.cleared_at != null ? String(row.cleared_at) : null,
    cleared_by: row.cleared_by != null ? String(row.cleared_by) : null,
    created_by: row.created_by != null ? String(row.created_by) : null,
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? new Date().toISOString())
  };
}

function isActiveNotice(notice: CastVideoNotice, now = Date.now()) {
  if (notice.status !== "active") return false;
  if (!notice.pushed_at) return false;
  if (notice.expires_at) {
    const expiresAt = new Date(notice.expires_at).getTime();
    if (Number.isFinite(expiresAt) && expiresAt <= now) return false;
  }
  return Boolean(notice.video_url || notice.video_storage_path);
}

function compareActiveNotices(a: CastVideoNotice, b: CastVideoNotice) {
  const priorityDiff = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
  if (priorityDiff !== 0) return priorityDiff;
  const pushedA = new Date(a.pushed_at ?? a.created_at).getTime();
  const pushedB = new Date(b.pushed_at ?? b.created_at).getTime();
  return pushedA - pushedB;
}

function sortActiveNotices(notices: CastVideoNotice[]) {
  return [...notices]
    .filter((notice) => notice.status === "active")
    .sort(compareActiveNotices);
}

type CastVideoState = { notices: CastVideoNotice[] };

async function loadFallbackState(supabase: SupabaseClient): Promise<CastVideoState> {
  const { data, error } = await supabase.from("admin_settings").select("settings").eq("id", "default").maybeSingle();
  if (error) return { notices: [] };
  const settings = (data?.settings ?? {}) as Record<string, unknown>;
  const raw = settings[SETTINGS_STORE_KEY];
  if (!raw || typeof raw !== "object") return { notices: [] };
  const notices = Array.isArray((raw as { notices?: unknown }).notices)
    ? ((raw as { notices: CastVideoNotice[] }).notices)
    : [];
  return { notices };
}

async function saveFallbackState(supabase: SupabaseClient, state: CastVideoState) {
  const { data, error } = await supabase.from("admin_settings").select("settings").eq("id", "default").maybeSingle();
  if (error) return;
  const settings = {
    ...((data?.settings ?? {}) as Record<string, unknown>),
    [SETTINGS_STORE_KEY]: state
  };
  await supabase.from("admin_settings").upsert({ id: "default", settings, updated_at: new Date().toISOString() });
}

export function normalizeCastVideoNoticeInput(input: CastVideoNoticeInput) {
  const title = sanitizeText(input.title, 120);
  if (!title) throw new Error("Title is required.");
  const description = sanitizeText(input.description, 500) || null;
  const priority = normalizePriority(input.priority);
  const departments = normalizeDepartments(input.departments);
  const video_storage_path = sanitizeText(input.video_storage_path, 500) || null;
  const video_url = sanitizeUrl(input.video_url, 1000);
  const thumbnail_storage_path = sanitizeText(input.thumbnail_storage_path, 500) || null;
  const thumbnail_url = sanitizeUrl(input.thumbnail_url, 1000);
  const mime_type = sanitizeMimeType(input.mime_type);
  const file_size_bytes = input.file_size_bytes != null ? Number(input.file_size_bytes) : null;
  const allow_sound = Boolean(input.allow_sound);
  const require_acknowledgement = Boolean(input.require_acknowledgement);
  const auto_clear_mode = normalizeAutoClearMode(input.auto_clear_mode);
  const scheduled_at = input.scheduled_at ? String(input.scheduled_at) : null;

  return {
    title,
    description,
    priority,
    departments,
    video_storage_path,
    video_url,
    thumbnail_storage_path,
    thumbnail_url,
    mime_type,
    file_size_bytes: Number.isFinite(file_size_bytes) ? file_size_bytes : null,
    allow_sound,
    require_acknowledgement,
    auto_clear_mode,
    scheduled_at
  };
}

export async function resolveCastVideoSignedUrls(supabase: SupabaseClient, notice: CastVideoNotice): Promise<CastVideoNotice> {
  let video_url = notice.video_url;
  let thumbnail_url = notice.thumbnail_url;

  try {
    if (notice.video_storage_path) {
      const { data } = await supabase.storage.from(CAST_VIDEO_BUCKET).createSignedUrl(notice.video_storage_path, 60 * 60 * 4);
      if (data?.signedUrl) video_url = data.signedUrl;
    }

    if (notice.thumbnail_storage_path) {
      const { data } = await supabase.storage.from(CAST_VIDEO_BUCKET).createSignedUrl(notice.thumbnail_storage_path, 60 * 60 * 4);
      if (data?.signedUrl) thumbnail_url = data.signedUrl;
    }
  } catch {
    // Keep existing public URLs if signed URL generation is slow/unavailable.
  }

  return { ...notice, video_url, thumbnail_url };
}

export async function expireStaleCastVideoNotices(supabase: SupabaseClient) {
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("cast_video_notices")
    .update({ status: "expired", updated_at: nowIso })
    .eq("status", "active")
    .not("expires_at", "is", null)
    .lte("expires_at", nowIso);

  if (error && isMissingRelation(error)) {
    const state = await loadFallbackState(supabase);
    const next = state.notices.map((notice) =>
      notice.status === "active" && notice.expires_at && new Date(notice.expires_at).getTime() <= Date.now()
        ? { ...notice, status: "expired" as const, updated_at: nowIso }
        : notice
    );
    await saveFallbackState(supabase, { notices: next });
    return;
  }
  if (error) throw error;
}

export async function activateDueScheduledCastVideos(supabase: SupabaseClient, actor?: string | null) {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("cast_video_notices")
    .select("*")
    .eq("status", "scheduled")
    .lte("scheduled_at", nowIso);

  if (error && isMissingRelation(error)) {
    const state = await loadFallbackState(supabase);
    let changed = false;
    const next = state.notices.map((notice) => {
      if (notice.status !== "scheduled" || !notice.scheduled_at) return notice;
      if (new Date(notice.scheduled_at).getTime() > Date.now()) return notice;
      changed = true;
      const pushed_at = nowIso;
      return {
        ...notice,
        status: "active" as const,
        pushed_at,
        pushed_by: actor ?? notice.pushed_by,
        expires_at: castVideoExpiresAtFromMode(notice.auto_clear_mode, new Date(pushed_at)),
        updated_at: nowIso
      };
    });
    if (changed) await saveFallbackState(supabase, { notices: next });
    return;
  }
  if (error) throw error;

  for (const row of data ?? []) {
    const notice = normalizeNoticeRow(row as Record<string, unknown>);
    await pushCastVideoNotice(supabase, notice.id, actor, { fromSchedule: true });
  }
}

function filterBoardNotices(notices: CastVideoNotice[], department: string | null | undefined, now = Date.now()) {
  return sortActiveNotices(notices).filter(
    (notice) => isActiveNotice(notice, now) && castVideoTargetsDepartment(notice, department)
  );
}

export async function loadCastVideoBoardState(
  supabase: SupabaseClient,
  options?: { department?: string | null; emergencyOnly?: boolean; mutate?: boolean }
) {
  // Board reads must stay fast — expire/activate writes belong on admin/push paths.
  if (options?.mutate !== false) {
    await Promise.allSettled([expireStaleCastVideoNotices(supabase), activateDueScheduledCastVideos(supabase)]);
  }
  const now = Date.now();
  const department = options?.department ?? "staff_whiteboard";
  const emergencyOnly = Boolean(options?.emergencyOnly);

  const { data, error } = await supabase
    .from("cast_video_notices")
    .select("*")
    .eq("status", "active")
    .order("pushed_at", { ascending: true })
    .limit(8);

  if (error && isMissingRelation(error)) {
    const state = await loadFallbackState(supabase);
    let active = filterBoardNotices(state.notices, department, now);
    if (emergencyOnly) active = active.filter((notice) => isEmergencyCastVideo(notice));
    else active = active.filter((notice) => !isEmergencyCastVideo(notice));
    const slice = active.slice(0, 5);
    const resolved = await Promise.all(slice.map((notice) => resolveCastVideoSignedUrls(supabase, notice)));
    return {
      activeNotice: resolved[0] ?? null,
      queue: resolved.slice(1, 5)
    };
  }
  if (error) throw error;

  let notices = (data ?? []).map((row) => normalizeNoticeRow(row as Record<string, unknown>));
  notices = filterBoardNotices(notices, department, now);
  if (emergencyOnly) {
    notices = notices.filter((notice) => isEmergencyCastVideo(notice));
  } else {
    notices = notices.filter((notice) => !isEmergencyCastVideo(notice));
  }

  const slice = notices.slice(0, 5);
  const resolved = await Promise.all(slice.map((notice) => resolveCastVideoSignedUrls(supabase, notice)));
  return {
    activeNotice: resolved[0] ?? null,
    queue: resolved.slice(1, 5)
  };
}

export async function listCastVideoNotices(supabase: SupabaseClient, limit = 50) {
  await expireStaleCastVideoNotices(supabase);
  const { data, error } = await supabase
    .from("cast_video_notices")
    .select("*")
    .neq("status", "deleted")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error && isMissingRelation(error)) {
    const state = await loadFallbackState(supabase);
    return [...state.notices]
      .filter((notice) => notice.status !== "deleted")
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit);
  }
  if (error) throw error;
  return (data ?? []).map((row) => normalizeNoticeRow(row as Record<string, unknown>));
}

export async function getCastVideoNotice(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase.from("cast_video_notices").select("*").eq("id", id).maybeSingle();
  if (error && isMissingRelation(error)) {
    const state = await loadFallbackState(supabase);
    const notice = state.notices.find((item) => item.id === id);
    if (!notice || notice.status === "deleted") return null;
    return notice;
  }
  if (error) throw error;
  if (!data) return null;
  return normalizeNoticeRow(data as Record<string, unknown>);
}

export async function createCastVideoNotice(
  supabase: SupabaseClient,
  input: CastVideoNoticeInput,
  actor?: string | null,
  options?: { asDraft?: boolean }
) {
  const normalized = normalizeCastVideoNoticeInput(input);
  const nowIso = new Date().toISOString();
  const payload = {
    ...normalized,
    status: (options?.asDraft ? "draft" : normalized.scheduled_at ? "scheduled" : "draft") as CastVideoStatus,
    created_by: actor ?? null,
    created_at: nowIso,
    updated_at: nowIso
  };

  const { data, error } = await supabase.from("cast_video_notices").insert(payload).select("*").single();
  if (error && isMissingRelation(error)) {
    const state = await loadFallbackState(supabase);
    const notice: CastVideoNotice = {
      id: newNoticeId(),
      ...payload,
      pushed_at: null,
      pushed_by: null,
      expires_at: null,
      cleared_at: null,
      cleared_by: null
    };
    await saveFallbackState(supabase, { notices: [notice, ...state.notices] });
    return notice;
  }
  if (error) throw error;
  return normalizeNoticeRow(data as Record<string, unknown>);
}

export async function updateCastVideoNotice(
  supabase: SupabaseClient,
  id: string,
  input: CastVideoNoticeInput,
  actor?: string | null
) {
  const existing = await getCastVideoNotice(supabase, id);
  if (!existing) throw new Error("Cast video notice not found.");
  if (existing.status === "deleted") throw new Error("This cast video has been deleted.");
  if (existing.status === "active") throw new Error("Clear the active cast video before editing.");

  const normalized = normalizeCastVideoNoticeInput({ ...existing, ...input, title: input.title ?? existing.title });
  const nowIso = new Date().toISOString();
  const payload = {
    ...normalized,
    status: normalized.scheduled_at ? ("scheduled" as const) : ("draft" as const),
    updated_at: nowIso
  };

  const { data, error } = await supabase.from("cast_video_notices").update(payload).eq("id", id).select("*").single();
  if (error && isMissingRelation(error)) {
    const state = await loadFallbackState(supabase);
    let updated: CastVideoNotice | null = null;
    const next = state.notices.map((notice) => {
      if (notice.id !== id) return notice;
      updated = { ...notice, ...payload };
      return updated;
    });
    await saveFallbackState(supabase, { notices: next });
    if (!updated) throw new Error("Cast video notice not found.");
    return updated;
  }
  if (error) throw error;
  return normalizeNoticeRow(data as Record<string, unknown>);
}

async function notifyBoardOverlaysChanged() {
  try {
    const { invalidateBoardOverlayCaches } = await import("@/lib/board-settings-cache");
    invalidateBoardOverlayCaches();
  } catch {
    // Best-effort — push path must stay fast even if cache helpers fail.
  }
}

export async function clearAllActiveCastVideos(supabase: SupabaseClient, actor?: string | null) {
  const nowIso = new Date().toISOString();
  const payload = {
    status: "cleared" as const,
    cleared_at: nowIso,
    cleared_by: actor ?? null,
    updated_at: nowIso
  };

  // Single batch update — the previous N+1 clear loop blocked every staff/grooming/trainer push.
  const { error } = await supabase.from("cast_video_notices").update(payload).eq("status", "active");
  if (error && isMissingRelation(error)) {
    const state = await loadFallbackState(supabase);
    let changed = false;
    const next = state.notices.map((notice) => {
      if (notice.status !== "active") return notice;
      changed = true;
      return { ...notice, ...payload };
    });
    if (changed) await saveFallbackState(supabase, { notices: next });
    await notifyBoardOverlaysChanged();
    return;
  }
  if (error) throw error;
  await notifyBoardOverlaysChanged();
}

/** Clears other active cast videos (including yard push) so a new cast can take over. */
export async function clearCompetingCastVideosBeforePush(
  supabase: SupabaseClient,
  pushedNotice: Pick<CastVideoNotice, "id" | "priority">,
  actor?: string | null
) {
  const nowIso = new Date().toISOString();
  const payload = {
    status: "cleared" as const,
    cleared_at: nowIso,
    cleared_by: actor ?? null,
    updated_at: nowIso
  };
  const pushingEmergency = isEmergencyCastVideo(pushedNotice);

  const { data, error } = await supabase
    .from("cast_video_notices")
    .select("id, priority, status")
    .eq("status", "active");

  if (error && isMissingRelation(error)) {
    const state = await loadFallbackState(supabase);
    let changed = false;
    const next = state.notices.map((notice) => {
      if (notice.status !== "active") return notice;
      if (notice.id === pushedNotice.id) return notice;
      if (!pushingEmergency && isEmergencyCastVideo(notice)) return notice;
      changed = true;
      return { ...notice, ...payload };
    });
    if (changed) await saveFallbackState(supabase, { notices: next });
    await notifyBoardOverlaysChanged();
    return;
  }
  if (error) throw error;

  const idsToClear = (data ?? [])
    .filter((row) => {
      const id = String(row.id);
      if (id === pushedNotice.id) return false;
      if (!pushingEmergency && isEmergencyCastVideo({ priority: row.priority as CastVideoPriority })) return false;
      return true;
    })
    .map((row) => String(row.id));

  if (idsToClear.length) {
    const { error: clearError } = await supabase
      .from("cast_video_notices")
      .update(payload)
      .in("id", idsToClear)
      .eq("status", "active");
    if (clearError) throw clearError;
  }
  await notifyBoardOverlaysChanged();
}

export async function pushCastVideoNotice(
  supabase: SupabaseClient,
  id: string,
  actor?: string | null,
  options?: { fromSchedule?: boolean }
) {
  const existing = await getCastVideoNotice(supabase, id);
  if (!existing) throw new Error("Cast video notice not found.");
  if (existing.status === "deleted") throw new Error("This cast video has been deleted.");
  if (!existing.video_storage_path && !existing.video_url) {
    throw new Error("Upload a video before pushing.");
  }

  await clearCompetingCastVideosBeforePush(supabase, existing, actor);

  const now = new Date();
  const nowIso = now.toISOString();
  const pushed_at = nowIso;
  const expires_at = castVideoExpiresAtFromMode(existing.auto_clear_mode, now);
  const payload = {
    status: "active" as const,
    pushed_at,
    pushed_by: actor ?? null,
    expires_at,
    scheduled_at: options?.fromSchedule ? existing.scheduled_at : null,
    updated_at: nowIso
  };

  const { data, error } = await supabase.from("cast_video_notices").update(payload).eq("id", id).select("*").single();
  if (error && isMissingRelation(error)) {
    const state = await loadFallbackState(supabase);
    let pushed: CastVideoNotice | null = null;
    const next = state.notices.map((notice) => {
      if (notice.id !== id) return notice;
      pushed = { ...notice, ...payload };
      return pushed;
    });
    await saveFallbackState(supabase, { notices: next });
    if (!pushed) throw new Error("Cast video notice not found.");
    await notifyBoardOverlaysChanged();
    void import("@/lib/shelly-alert")
      .then(({ triggerShellyAlert }) => triggerShellyAlert("cast_video_push", `cast-video:${id}`))
      .catch(() => undefined);
    return pushed;
  }
  if (error) throw error;
  const pushed = normalizeNoticeRow(data as Record<string, unknown>);
  await notifyBoardOverlaysChanged();
  void import("@/lib/shelly-alert")
    .then(({ triggerShellyAlert }) => triggerShellyAlert("cast_video_push", `cast-video:${pushed.id}`))
    .catch(() => undefined);
  return pushed;
}

export async function clearCastVideoNotice(supabase: SupabaseClient, id: string, actor?: string | null) {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("cast_video_notices")
    .update({ status: "cleared", cleared_at: nowIso, cleared_by: actor ?? null, updated_at: nowIso })
    .eq("id", id)
    .in("status", ["active", "scheduled"])
    .select("*")
    .maybeSingle();

  if (error && isMissingRelation(error)) {
    const state = await loadFallbackState(supabase);
    let cleared: CastVideoNotice | null = null;
    const next = state.notices.map((notice) => {
      if (notice.id !== id || !["active", "scheduled"].includes(notice.status)) return notice;
      cleared = { ...notice, status: "cleared", cleared_at: nowIso, cleared_by: actor ?? null, updated_at: nowIso };
      return cleared;
    });
    await saveFallbackState(supabase, { notices: next });
    if (!cleared) throw new Error("Cast video notice not found.");
    await notifyBoardOverlaysChanged();
    return cleared;
  }
  if (error) throw error;
  if (!data) throw new Error("Cast video notice not found.");
  await notifyBoardOverlaysChanged();
  return normalizeNoticeRow(data as Record<string, unknown>);
}

export async function deleteCastVideoNotice(supabase: SupabaseClient, id: string, actor?: string | null) {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("cast_video_notices")
    .update({ status: "deleted", cleared_at: nowIso, cleared_by: actor ?? null, updated_at: nowIso })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error && isMissingRelation(error)) {
    const state = await loadFallbackState(supabase);
    let deleted: CastVideoNotice | null = null;
    const next = state.notices.map((notice) => {
      if (notice.id !== id) return notice;
      deleted = { ...notice, status: "deleted", cleared_at: nowIso, cleared_by: actor ?? null, updated_at: nowIso };
      return deleted;
    });
    await saveFallbackState(supabase, { notices: next });
    if (!deleted) throw new Error("Cast video notice not found.");
    return deleted;
  }
  if (error) throw error;
  if (!data) throw new Error("Cast video notice not found.");
  return normalizeNoticeRow(data as Record<string, unknown>);
}

export async function recordCastVideoViewOpen(
  supabase: SupabaseClient,
  input: {
    notice_id: string;
    viewer_key: string;
    viewer_role?: string | null;
    viewer_location?: string | null;
  }
) {
  const nowIso = new Date().toISOString();
  const payload = {
    notice_id: input.notice_id,
    viewer_key: input.viewer_key,
    viewer_role: input.viewer_role ?? null,
    viewer_location: input.viewer_location ?? null,
    opened_at: nowIso,
    updated_at: nowIso
  };

  const { data, error } = await supabase
    .from("cast_video_views")
    .upsert(payload, { onConflict: "notice_id,viewer_key" })
    .select("*")
    .single();

  if (error && isMissingRelation(error)) return null;
  if (error) throw error;
  return data as CastVideoView;
}

export async function recordCastVideoViewClose(
  supabase: SupabaseClient,
  input: {
    notice_id: string;
    viewer_key: string;
    watch_duration_ms: number;
    acknowledged: boolean;
    skipped: boolean;
  }
) {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("cast_video_views")
    .update({
      closed_at: nowIso,
      watch_duration_ms: Math.max(0, Math.floor(input.watch_duration_ms)),
      acknowledged: input.acknowledged,
      skipped: input.skipped,
      updated_at: nowIso
    })
    .eq("notice_id", input.notice_id)
    .eq("viewer_key", input.viewer_key)
    .select("*")
    .maybeSingle();

  if (error && isMissingRelation(error)) return null;
  if (error) throw error;
  return data as CastVideoView | null;
}

export async function getCastVideoViewStats(supabase: SupabaseClient, noticeId: string): Promise<CastVideoViewStats> {
  const { data, error } = await supabase
    .from("cast_video_views")
    .select("watch_duration_ms, closed_at, acknowledged")
    .eq("notice_id", noticeId);

  if (error && isMissingRelation(error)) {
    return { viewed: 0, pending: 0, average_watch_ms: 0 };
  }
  if (error) throw error;

  const rows = data ?? [];
  const viewed = rows.filter((row) => row.closed_at).length;
  const pending = rows.filter((row) => !row.closed_at).length;
  const durations = rows
    .map((row) => Number(row.watch_duration_ms ?? 0))
    .filter((value) => Number.isFinite(value) && value > 0);
  const average_watch_ms = durations.length
    ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
    : 0;

  return { viewed, pending, average_watch_ms };
}
