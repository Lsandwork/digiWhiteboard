type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export type StaffPushNoticePriority = "normal" | "important" | "urgent";
export type StaffPushNoticeDisplayMode = "normal" | "urgent";
export type StaffPushNoticeRecurrence = "none" | "day" | "week" | "month";
export type StaffPushNoticeType = "standard" | "owner_complaint_dog_handler" | "daily_reminder";
export type DailyReminderPushSentType = "automatic" | "early" | "force_resend";

export type OwnerComplaintCategory = "on_phone" | "yard_dirty" | "not_engaged" | "handling_concern";

export const OWNER_COMPLAINT_CATEGORIES: Record<
  OwnerComplaintCategory,
  { label: string; message: string }
> = {
  on_phone: {
    label: "On Phone",
    message: "Keep phones away while supervising dogs unless required for work."
  },
  yard_dirty: {
    label: "Yard Dirty",
    message: "Confirm the yard is clean, safe, and ready for dogs."
  },
  not_engaged: {
    label: "Not Engaged",
    message: "Please actively engage with dogs and keep the yard attentive."
  },
  handling_concern: {
    label: "Handling Concern",
    message: "Review dog handling practices with management."
  }
};

export const OWNER_COMPLAINT_CATEGORY_OPTIONS = Object.entries(OWNER_COMPLAINT_CATEGORIES).map(
  ([value, meta]) => ({ value: value as OwnerComplaintCategory, label: meta.label })
);

export type StaffPushNotice = {
  id: string;
  title: string;
  message: string | null;
  priority: StaffPushNoticePriority;
  display_mode: StaffPushNoticeDisplayMode;
  is_active: boolean;
  is_default: boolean;
  notice_type?: StaffPushNoticeType;
  complaint_category?: OwnerComplaintCategory | null;
  dog_handler_name?: string | null;
  created_by: string | null;
  updated_by: string | null;
  pushed_at: string | null;
  expires_at: string | null;
  display_duration_minutes?: number;
  cleared_at: string | null;
  schedule_enabled?: boolean;
  scheduled_at?: string | null;
  recurrence?: StaffPushNoticeRecurrence;
  next_scheduled_at?: string | null;
  daily_reminder_id?: string | null;
  daily_reminder_sent_type?: DailyReminderPushSentType | null;
  daily_reminder_scheduled_time?: string | null;
  daily_reminder_audience?: string[] | null;
  daily_reminder_sent_by_name?: string | null;
  daily_reminder_footer?: string | null;
  source?: string | null;
  source_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type StaffPushNoticeInput = {
  title?: unknown;
  message?: unknown;
  priority?: unknown;
  display_mode?: unknown;
  expires_at?: unknown;
  display_duration_minutes?: unknown;
  is_default?: unknown;
  notice_type?: unknown;
  complaint_category?: unknown;
  dog_handler_name?: unknown;
  schedule_enabled?: unknown;
  scheduled_at?: unknown;
  recurrence?: unknown;
  daily_reminder_id?: unknown;
  daily_reminder_sent_type?: unknown;
  daily_reminder_scheduled_time?: unknown;
  daily_reminder_audience?: unknown;
  daily_reminder_sent_by_name?: unknown;
  daily_reminder_footer?: unknown;
  source?: unknown;
  source_id?: unknown;
};

export const DOG_HANDLER_COMPLAINT_NOTICE_LABEL = "Owner Complaint";
export const DOG_HANDLER_COMPLAINT_WHITEBOARD_TITLE = "OWNER COMPLAINT";
export const DOG_HANDLER_COMPLAINT_MESSAGE =
  "Owner complaint involving dog handler. Management review required.";

export function getOwnerComplaintCategoryLabel(category?: OwnerComplaintCategory | null) {
  if (!category) return null;
  return OWNER_COMPLAINT_CATEGORIES[category]?.label ?? null;
}

export function normalizeOwnerComplaintCategory(value: unknown): OwnerComplaintCategory | null {
  if (value === "on_phone" || value === "yard_dirty" || value === "not_engaged" || value === "handling_concern") {
    return value;
  }
  return null;
}

const MAX_DOG_HANDLER_NAME_LENGTH = 80;

export function sanitizeDogHandlerName(value: unknown) {
  return String(value ?? "")
    .replace(/[<>&"'`/\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_DOG_HANDLER_NAME_LENGTH);
}

export function isDogHandlerComplaintNotice(notice: Pick<StaffPushNotice, "notice_type" | "title">) {
  return notice.notice_type === "owner_complaint_dog_handler";
}

export function isDailyReminderPushNotice(notice: Pick<StaffPushNotice, "notice_type">) {
  return notice.notice_type === "daily_reminder";
}

export function buildOwnerComplaintNoticeInput(
  complaintCategory: OwnerComplaintCategory,
  dogHandlerName: string,
  displayDurationMinutes?: unknown
): StaffPushNoticeInput {
  const category = OWNER_COMPLAINT_CATEGORIES[complaintCategory];
  return {
    title: DOG_HANDLER_COMPLAINT_WHITEBOARD_TITLE,
    message: `${category.label}: ${category.message}`,
    priority: "urgent",
    display_mode: "urgent",
    notice_type: "owner_complaint_dog_handler",
    complaint_category: complaintCategory,
    dog_handler_name: dogHandlerName,
    display_duration_minutes: displayDurationMinutes,
    is_default: false
  };
}

export function buildDogHandlerComplaintNoticeInput(
  dogHandlerName: string,
  displayDurationMinutes?: unknown,
  complaintCategory: OwnerComplaintCategory = "handling_concern"
): StaffPushNoticeInput {
  return buildOwnerComplaintNoticeInput(complaintCategory, dogHandlerName, displayDurationMinutes);
}

export const DEFAULT_STAFF_PUSH_NOTICES: readonly Pick<
  StaffPushNotice,
  "title" | "message" | "priority" | "display_mode" | "is_default"
>[] = [
  {
    title: "OWNER COMPLAINT - Engage with dogs",
    message: "Please actively engage with dogs and keep the yard attentive.",
    priority: "urgent",
    display_mode: "urgent",
    is_default: true
  },
  {
    title: "OWNER COMPLAINT - Phone Usage",
    message: "Keep phones away while supervising dogs unless required for work.",
    priority: "urgent",
    display_mode: "urgent",
    is_default: true
  },
  {
    title: "OWNER COMPLAINT - Dog not on yard",
    message: "Confirm every dog is on the correct yard and visible to handlers.",
    priority: "urgent",
    display_mode: "urgent",
    is_default: true
  }
];

const NOTICE_SELECT = "*";
const MAX_TITLE_LENGTH = 120;
const MAX_MESSAGE_LENGTH = 600;
export const DEFAULT_NOTICE_DURATION_MINUTES = 5;
const MIN_NOTICE_DURATION_MINUTES = 1;
const MAX_NOTICE_DURATION_MINUTES = 240;
const SETTINGS_STORE_KEY = "staff_push_notices";
const STAFF_SETTINGS_FALLBACK_PREFIX = "__staff_push_notices__:";
const ACTIVITY_LOG_ACTION = "staff_push_notices_state";
const ACTIVITY_LOG_SOURCE = "admin_push_notices";

type StaffPushNoticeState = {
  notices: StaffPushNotice[];
};

function normalizePriority(value: unknown): StaffPushNoticePriority {
  if (value === "important" || value === "urgent") return value;
  return "normal";
}

function normalizeDisplayMode(value: unknown, priority: StaffPushNoticePriority): StaffPushNoticeDisplayMode {
  if (value === "urgent" || priority === "urgent") return "urgent";
  return "normal";
}

function normalizeRecurrence(value: unknown): StaffPushNoticeRecurrence {
  if (value === "day" || value === "week" || value === "month") return value;
  return "none";
}

function normalizeNoticeType(value: unknown): StaffPushNoticeType | undefined {
  if (value === "owner_complaint_dog_handler" || value === "daily_reminder") return value;
  return undefined;
}

function normalizeDailyReminderSentType(value: unknown): DailyReminderPushSentType | null {
  if (value === "automatic" || value === "early" || value === "force_resend") return value;
  return null;
}

function normalizeStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const next = value.map((item) => String(item).trim()).filter(Boolean);
  return next.length ? next : null;
}

function normalizeDogHandlerName(value: unknown) {
  if (value == null || value === "") return null;
  const cleaned = sanitizeDogHandlerName(value);
  return cleaned || null;
}

function normalizeOptionalDate(value: unknown) {
  if (value == null || value === "") return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function normalizeDurationMinutes(value: unknown) {
  if (value == null || value === "") return DEFAULT_NOTICE_DURATION_MINUTES;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_NOTICE_DURATION_MINUTES;
  return Math.min(MAX_NOTICE_DURATION_MINUTES, Math.max(MIN_NOTICE_DURATION_MINUTES, Math.round(parsed)));
}

function addMinutes(value: string, minutes: number) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
}

function resolvePushExpiration(expiresAt: unknown, durationMinutes: unknown, pushedAt: string) {
  return normalizeOptionalDate(expiresAt) ?? addMinutes(pushedAt, normalizeDurationMinutes(durationMinutes));
}

function getEffectiveExpiresAt(notice: StaffPushNotice) {
  if (notice.expires_at) return notice.expires_at;
  if (!notice.pushed_at) return null;
  return addMinutes(notice.pushed_at, normalizeDurationMinutes(notice.display_duration_minutes));
}

function addRecurrenceDate(value: string, recurrence: StaffPushNoticeRecurrence) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (recurrence === "day") date.setDate(date.getDate() + 1);
  else if (recurrence === "week") date.setDate(date.getDate() + 7);
  else if (recurrence === "month") date.setMonth(date.getMonth() + 1);
  else return null;
  return date.toISOString();
}

export function normalizeNoticeInput(input: StaffPushNoticeInput) {
  const title = String(input.title ?? "").trim().slice(0, MAX_TITLE_LENGTH);
  const message = String(input.message ?? "").trim().slice(0, MAX_MESSAGE_LENGTH);
  const priority = normalizePriority(input.priority);
  const recurrence = normalizeRecurrence(input.recurrence);
  const scheduled_at = normalizeOptionalDate(input.scheduled_at);
  const schedule_enabled = Boolean(input.schedule_enabled || scheduled_at || recurrence !== "none");
  const display_duration_minutes = normalizeDurationMinutes(input.display_duration_minutes);

  if (!title) {
    throw new Error("Notice title is required.");
  }

  const notice_type = normalizeNoticeType(input.notice_type);
  const complaint_category = normalizeOwnerComplaintCategory(input.complaint_category);
  const dog_handler_name = normalizeDogHandlerName(input.dog_handler_name);

  if (notice_type === "owner_complaint_dog_handler" && !complaint_category) {
    throw new Error("Please select an owner complaint reason before pushing this notice.");
  }

  if (notice_type === "owner_complaint_dog_handler" && !dog_handler_name) {
    throw new Error("Please enter the dog handler name before pushing this notice.");
  }

  const daily_reminder_id = input.daily_reminder_id != null ? String(input.daily_reminder_id) : null;
  const daily_reminder_sent_type = normalizeDailyReminderSentType(input.daily_reminder_sent_type);
  const daily_reminder_scheduled_time =
    input.daily_reminder_scheduled_time != null ? String(input.daily_reminder_scheduled_time) : null;
  const daily_reminder_audience = normalizeStringArray(input.daily_reminder_audience);
  const daily_reminder_sent_by_name =
    input.daily_reminder_sent_by_name != null ? sanitizeDogHandlerName(input.daily_reminder_sent_by_name) : null;
  const daily_reminder_footer =
    input.daily_reminder_footer != null ? String(input.daily_reminder_footer).trim().slice(0, 200) : null;
  const source = input.source != null ? String(input.source).trim().slice(0, 80) : null;
  const source_id = input.source_id != null ? String(input.source_id).trim().slice(0, 80) : null;

  return {
    title,
    message: message || null,
    priority,
    display_mode: normalizeDisplayMode(input.display_mode, priority),
    expires_at: normalizeOptionalDate(input.expires_at),
    display_duration_minutes,
    is_default: Boolean(input.is_default),
    notice_type,
    complaint_category,
    dog_handler_name,
    schedule_enabled,
    scheduled_at,
    recurrence,
    next_scheduled_at: schedule_enabled ? scheduled_at : null,
    daily_reminder_id,
    daily_reminder_sent_type,
    daily_reminder_scheduled_time,
    daily_reminder_audience,
    daily_reminder_sent_by_name,
    daily_reminder_footer,
    source,
    source_id
  };
}

function isMissingRelation(error: { code?: string; message?: string } | null) {
  return error?.code === "42P01" || error?.code === "PGRST205" || Boolean(error?.message?.includes("schema cache"));
}

function newNoticeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `notice-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sortNotices(notices: StaffPushNotice[]) {
  return [...notices].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

function emptyNoticeState(): StaffPushNoticeState {
  return { notices: [] };
}

function parseNoticeState(value: unknown): StaffPushNoticeState {
  if (!value || typeof value !== "object") return emptyNoticeState();
  const notices = Array.isArray((value as { notices?: unknown }).notices)
    ? ((value as { notices: StaffPushNotice[] }).notices)
    : [];
  return { notices: sortNotices(notices) };
}

async function loadNoticeStateFromAdminSettings(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("admin_settings").select("settings").eq("id", "default").maybeSingle();
  if (error) {
    if (isMissingRelation(error)) return null;
    throw error;
  }
  const settings = (data?.settings ?? {}) as Record<string, unknown>;
  return parseNoticeState(settings[SETTINGS_STORE_KEY]);
}

async function saveNoticeStateToAdminSettings(supabase: SupabaseClient, state: StaffPushNoticeState) {
  const { data, error } = await supabase.from("admin_settings").select("settings").eq("id", "default").maybeSingle();
  if (error) {
    if (isMissingRelation(error)) return false;
    throw error;
  }
  const settings = {
    ...((data?.settings ?? {}) as Record<string, unknown>),
    [SETTINGS_STORE_KEY]: { notices: sortNotices(state.notices) }
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

async function loadNoticeStateFromStaffSettings(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("staff_board_settings").select("footer_message").eq("id", "default").maybeSingle();
  if (error) {
    if (isMissingRelation(error)) return null;
    throw error;
  }
  const raw = typeof data?.footer_message === "string" ? data.footer_message : "";
  if (!raw.startsWith(STAFF_SETTINGS_FALLBACK_PREFIX)) return emptyNoticeState();
  try {
    return parseNoticeState(JSON.parse(raw.slice(STAFF_SETTINGS_FALLBACK_PREFIX.length)));
  } catch {
    return emptyNoticeState();
  }
}

async function saveNoticeStateToStaffSettings(supabase: SupabaseClient, state: StaffPushNoticeState) {
  const { error } = await supabase
    .from("staff_board_settings")
    .upsert({
      id: "default",
      footer_message: `${STAFF_SETTINGS_FALLBACK_PREFIX}${JSON.stringify({ notices: sortNotices(state.notices) })}`,
      updated_at: new Date().toISOString()
    });
  if (error) {
    if (isMissingRelation(error)) return false;
    throw error;
  }
  return true;
}

async function loadNoticeStateFromActivityLog(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("board_activity_log")
    .select("details")
    .eq("action", ACTIVITY_LOG_ACTION)
    .eq("source", ACTIVITY_LOG_SOURCE)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingRelation(error)) return null;
    throw error;
  }

  return parseNoticeState(data?.details);
}

async function saveNoticeStateToActivityLog(supabase: SupabaseClient, state: StaffPushNoticeState) {
  const { error } = await supabase.from("board_activity_log").insert({
    action: ACTIVITY_LOG_ACTION,
    source: ACTIVITY_LOG_SOURCE,
    details: { notices: sortNotices(state.notices) }
  });

  if (error) {
    if (isMissingRelation(error)) return false;
    throw error;
  }

  return true;
}

async function loadNoticeState(supabase: SupabaseClient) {
  return (await loadNoticeStateFromAdminSettings(supabase))
    ?? (await loadNoticeStateFromStaffSettings(supabase))
    ?? (await loadNoticeStateFromActivityLog(supabase))
    ?? emptyNoticeState();
}

async function saveNoticeState(supabase: SupabaseClient, state: StaffPushNoticeState) {
  if (await saveNoticeStateToAdminSettings(supabase, state)) return;
  if (await saveNoticeStateToStaffSettings(supabase, state)) return;
  if (await saveNoticeStateToActivityLog(supabase, state)) return;
  throw new Error("Push Notice storage is not available.");
}

function getActiveNoticeFromState(state: StaffPushNoticeState) {
  const now = Date.now();
  return sortNotices(state.notices).find((notice) => {
    if (!notice.is_active || notice.cleared_at) return false;
    const expiresAt = getEffectiveExpiresAt(notice);
    if (expiresAt && new Date(expiresAt).getTime() <= now) return false;
    return true;
  }) ?? null;
}

function clearExpiredActiveNoticesInState(state: StaffPushNoticeState, actor: string | null) {
  const nowMs = Date.now();
  const now = new Date().toISOString();
  let changed = false;

  const notices = state.notices.map((notice) => {
    if (!notice.is_active || notice.cleared_at) return notice;
    const expiresAt = getEffectiveExpiresAt(notice);
    if (!expiresAt || new Date(expiresAt).getTime() > nowMs) return notice;

    changed = true;
    const recurrence = notice.recurrence ?? "none";
    return {
      ...notice,
      is_active: false,
      expires_at: expiresAt,
      cleared_at: now,
      updated_at: now,
      updated_by: actor,
      schedule_enabled: recurrence !== "none" ? true : notice.schedule_enabled,
      next_scheduled_at: recurrence !== "none"
        ? notice.next_scheduled_at ?? addRecurrenceDate(notice.pushed_at ?? now, recurrence)
        : notice.next_scheduled_at
    };
  });

  return { state: { notices: sortNotices(notices) }, changed };
}

function resolveDueScheduledNotice(state: StaffPushNoticeState, actor: string | null) {
  const nowMs = Date.now();
  const due = sortNotices(state.notices)
    .filter((notice) => {
      if (!notice.schedule_enabled || notice.is_active) return false;
      if (notice.cleared_at && (notice.recurrence ?? "none") === "none") return false;
      const nextRun = notice.next_scheduled_at ?? notice.scheduled_at;
      if (!nextRun) return false;
      return new Date(nextRun).getTime() <= nowMs;
    })
    .sort((a, b) => new Date(a.next_scheduled_at ?? a.scheduled_at ?? a.created_at).getTime() - new Date(b.next_scheduled_at ?? b.scheduled_at ?? b.created_at).getTime())[0];

  if (!due) return { state, activeNotice: null as StaffPushNotice | null };

  const now = new Date().toISOString();
  const recurrence = due.recurrence ?? "none";
  const displayDurationMinutes = normalizeDurationMinutes(due.display_duration_minutes);
  const updated: StaffPushNotice = {
    ...due,
    is_active: true,
    pushed_at: now,
    expires_at: addMinutes(now, displayDurationMinutes),
    display_duration_minutes: displayDurationMinutes,
    cleared_at: null,
    updated_at: now,
    updated_by: actor,
    schedule_enabled: recurrence !== "none",
    next_scheduled_at: recurrence === "none" ? null : addRecurrenceDate(due.next_scheduled_at ?? due.scheduled_at ?? now, recurrence)
  };

  const nextState = clearActiveNoticesInState(state, actor, due.id);
  return {
    state: {
      notices: sortNotices(nextState.notices.map((notice) => (notice.id === due.id ? updated : notice)))
    },
    activeNotice: updated
  };
}

function clearActiveNoticesInState(state: StaffPushNoticeState, actor: string | null, exceptId?: string) {
  const now = new Date().toISOString();
  return {
    notices: state.notices.map((notice) => {
      if (!notice.is_active || notice.id === exceptId) return notice;
      const recurrence = notice.recurrence ?? "none";
      return {
        ...notice,
        is_active: false,
        cleared_at: now,
        updated_at: now,
        updated_by: actor,
        schedule_enabled: recurrence !== "none" ? true : notice.schedule_enabled,
        next_scheduled_at: recurrence !== "none"
          ? notice.next_scheduled_at ?? addRecurrenceDate(notice.pushed_at ?? now, recurrence)
          : notice.next_scheduled_at
      };
    })
  };
}

export async function loadActiveStaffPushNotice(
  supabase: SupabaseClient,
  options?: { mutate?: boolean }
): Promise<StaffPushNotice | null> {
  const loadedState = await loadNoticeState(supabase);
  const mutate = options?.mutate !== false;

  // Board/cast reads must stay read-only — expire/schedule writes amplify admin_settings traffic.
  if (!mutate) {
    return getActiveNoticeFromState(loadedState);
  }

  const cleared = clearExpiredActiveNoticesInState(loadedState, "timeout");
  const state = cleared.state;
  const active = getActiveNoticeFromState(state);
  if (cleared.changed) await saveNoticeState(supabase, state);
  if (active) return active;

  const resolved = resolveDueScheduledNotice(state, "schedule");
  if (resolved.activeNotice) {
    await saveNoticeState(supabase, resolved.state);
  }
  return resolved.activeNotice;
}

export async function listStaffPushNotices(supabase: SupabaseClient, limit = 50): Promise<StaffPushNotice[]> {
  const state = await loadNoticeState(supabase);
  return sortNotices(state.notices).slice(0, limit);
}

export async function createStaffPushNotice(
  supabase: SupabaseClient,
  input: StaffPushNoticeInput,
  actor: string | null
) {
  const normalized = normalizeNoticeInput(input);
  const now = new Date().toISOString();
  const notice: StaffPushNotice = {
    id: newNoticeId(),
    ...normalized,
    is_active: false,
    created_by: actor,
    updated_by: actor,
    pushed_at: null,
    cleared_at: null,
    created_at: now,
    updated_at: now
  };
  const state = await loadNoticeState(supabase);
  await saveNoticeState(supabase, { notices: sortNotices([notice, ...state.notices]) });
  return notice;
}

export async function updateStaffPushNotice(
  supabase: SupabaseClient,
  id: string,
  input: StaffPushNoticeInput,
  actor: string | null
) {
  const normalized = normalizeNoticeInput(input);
  const now = new Date().toISOString();
  const state = await loadNoticeState(supabase);
  const existing = state.notices.find((notice) => notice.id === id);
  if (!existing) throw new Error("Push Notice not found.");
  const updated: StaffPushNotice = {
    ...existing,
    ...normalized,
    updated_by: actor,
    updated_at: now
  };
  await saveNoticeState(supabase, {
    notices: sortNotices(state.notices.map((notice) => (notice.id === id ? updated : notice)))
  });
  return updated;
}

export async function pushStaffNoticeById(
  supabase: SupabaseClient,
  id: string,
  actor: string | null,
  expiresAt?: unknown
) {
  const { clearAllActiveCastVideos } = await import("@/lib/staff/cast-video-notices");
  await clearAllActiveCastVideos(supabase, actor);

  const now = new Date().toISOString();
  const state = clearActiveNoticesInState(await loadNoticeState(supabase), actor, id);
  const existing = state.notices.find((notice) => notice.id === id);
  if (!existing) throw new Error("Push Notice not found.");
  const updated: StaffPushNotice = {
    ...existing,
    is_active: true,
    pushed_at: now,
    cleared_at: null,
    updated_by: actor,
    updated_at: now,
    display_duration_minutes: normalizeDurationMinutes(existing.display_duration_minutes),
    expires_at: resolvePushExpiration(expiresAt, existing.display_duration_minutes, now)
  };
  await saveNoticeState(supabase, {
    notices: sortNotices(state.notices.map((notice) => (notice.id === id ? updated : notice)))
  });
  const { triggerShellyAlertForPushNotice } = await import("@/lib/shelly-push-alerts");
  await triggerShellyAlertForPushNotice(updated);
  return updated;
}

export async function createAndPushStaffNotice(
  supabase: SupabaseClient,
  input: StaffPushNoticeInput,
  actor: string | null
) {
  const { clearAllActiveCastVideos } = await import("@/lib/staff/cast-video-notices");
  await clearAllActiveCastVideos(supabase, actor);

  const state = clearActiveNoticesInState(await loadNoticeState(supabase), actor);
  const normalized = normalizeNoticeInput(input);
  const now = new Date().toISOString();
  const notice: StaffPushNotice = {
    id: newNoticeId(),
    ...normalized,
    is_active: true,
    cleared_at: null,
    pushed_at: now,
    expires_at: resolvePushExpiration(normalized.expires_at, normalized.display_duration_minutes, now),
    created_by: actor,
    updated_by: actor,
    created_at: now,
    updated_at: now
  };
  await saveNoticeState(supabase, { notices: sortNotices([notice, ...state.notices]) });
  const { triggerShellyAlertForPushNotice } = await import("@/lib/shelly-push-alerts");
  await triggerShellyAlertForPushNotice(notice);
  return notice;
}

export async function clearActiveStaffPushNotice(supabase: SupabaseClient, actor: string | null) {
  await saveNoticeState(supabase, clearActiveNoticesInState(await loadNoticeState(supabase), actor));
  const { clearShellyAlert } = await import("@/lib/shelly-alert");
  await clearShellyAlert("push_notice_clear");
}

export async function deleteStaffPushNotice(supabase: SupabaseClient, id: string) {
  const state = await loadNoticeState(supabase);
  await saveNoticeState(supabase, { notices: state.notices.filter((notice) => notice.id !== id) });
}
