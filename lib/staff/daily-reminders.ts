type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

import { loadAdminSettings } from "@/lib/admin/settings";
import { loadGroomingPushBoardState } from "@/lib/staff/grooming-push-notices";
import {
  createAndPushStaffNotice,
  isDogHandlerComplaintNotice,
  loadActiveStaffPushNotice,
  type StaffPushNotice,
  type StaffPushNoticeInput,
  type StaffPushNoticePriority
} from "@/lib/staff/push-notices";

export type DailyReminderAudience = "dog_handler" | "team_lead";
export type DailyReminderShiftGroup = "am_handler" | "swing_handler" | "all_handler_shifts";
export type DailyReminderPriority = "low" | "normal" | "important";
export type DailyReminderSendType = "automatic" | "early" | "force_resend";
export type DailyReminderTodayStatus =
  | "pending_today"
  | "sent_early_today"
  | "sent_automatic_today"
  | "force_resent_today"
  | "queued_today"
  | "skipped_today"
  | "inactive"
  | "not_scheduled_today"
  | "swing_handler_off";

export type DailyReminder = {
  id: string;
  title: string;
  message: string;
  scheduled_time: string;
  audience: DailyReminderAudience[];
  shift_group: DailyReminderShiftGroup;
  priority: DailyReminderPriority;
  display_duration_seconds: number;
  active_days: string[];
  requires_swing_handler: boolean;
  is_active: boolean;
  footer_text: string | null;
  internal_notes: string | null;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
};

export type DailyReminderSend = {
  id: string;
  daily_reminder_id: string;
  shift_date: string;
  sent_at: string;
  sent_type: DailyReminderSendType;
  sent_by_user_id: string | null;
  sent_by_name: string | null;
  push_notice_id: string | null;
  skipped_reason: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type DailyReminderRow = DailyReminder & {
  today_status: DailyReminderTodayStatus;
  last_sent_at: string | null;
  last_sent_type: DailyReminderSendType | null;
  next_scheduled_send: string | null;
  today_state_id: string | null;
  can_send_early: boolean;
  send_early_disabled_reason: string | null;
};

export type SendDueDailyRemindersResult = {
  sent_count: number;
  skipped_count: number;
  skipped_sent_early_count: number;
  skipped_already_sent_count: number;
  skipped_inactive_count: number;
  skipped_not_due_count: number;
  skipped_swing_handler_count: number;
  queued_count: number;
  error_count: number;
  errors: string[];
};

export const DEFAULT_DAILY_REMINDER_FOOTER =
  "Helping the Lead keeps every dog safe, clean, and cared for.";

export const DAILY_REMINDER_DISPLAY_DURATION_OPTIONS = [30, 60, 120, 180, 300] as const;

export const DAILY_REMINDER_AUDIENCE_OPTIONS = [
  { value: "dog_handler" as const, label: "Dog Handlers" },
  { value: "team_lead" as const, label: "Team Leads" }
];

export const DAILY_REMINDER_SHIFT_GROUP_OPTIONS = [
  { value: "am_handler" as const, label: "AM Handler" },
  { value: "swing_handler" as const, label: "Swing Handler" },
  { value: "all_handler_shifts" as const, label: "All Handler Shifts" }
];

export const DAILY_REMINDER_PRIORITY_OPTIONS = [
  { value: "low" as const, label: "Low" },
  { value: "normal" as const, label: "Normal" },
  { value: "important" as const, label: "Important" }
];

export const DAILY_REMINDER_DAY_OPTIONS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday"
] as const;

const SWING_HANDLER_SETTINGS_KEY = "daily_reminders_swing_handler_present";
const MIN_DOG_HANDLER_MINUTES = 6 * 60 + 30;

const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

function isMissingRelation(error: { code?: string; message?: string } | null) {
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    Boolean(error?.message?.includes("daily_reminder"))
  );
}

function normalizeAudience(values: unknown): DailyReminderAudience[] {
  if (!Array.isArray(values) || !values.length) return ["dog_handler", "team_lead"];
  const allowed = new Set<DailyReminderAudience>(["dog_handler", "team_lead"]);
  const next = [...new Set(values.map((v) => String(v) as DailyReminderAudience).filter((v) => allowed.has(v)))];
  return next.length ? next : ["dog_handler", "team_lead"];
}

function normalizeShiftGroup(value: unknown): DailyReminderShiftGroup {
  if (value === "swing_handler" || value === "all_handler_shifts") return value;
  return "am_handler";
}

function normalizePriority(value: unknown): DailyReminderPriority {
  if (value === "low" || value === "important") return value;
  return "normal";
}

function normalizeDays(values: unknown): string[] {
  if (!Array.isArray(values) || !values.length) return [...DAILY_REMINDER_DAY_OPTIONS];
  const allowed = new Set<string>(DAILY_REMINDER_DAY_OPTIONS);
  const next = [...new Set(values.map((v) => String(v).toLowerCase()).filter((v) => allowed.has(v)))];
  return next.length ? next : [...DAILY_REMINDER_DAY_OPTIONS];
}

function normalizeDurationSeconds(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 120;
  if ((DAILY_REMINDER_DISPLAY_DURATION_OPTIONS as readonly number[]).includes(parsed)) return parsed;
  return 120;
}

function normalizeTime(value: unknown) {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) throw new Error("Scheduled time must use HH:MM format.");
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] ?? 0);
  if (hours > 23 || minutes > 59 || seconds > 59) throw new Error("Scheduled time is invalid.");
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function sanitizeText(value: unknown, maxLength: number) {
  return String(value ?? "")
    .replace(/[<>&"'`/\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function rowToReminder(row: Record<string, unknown>): DailyReminder {
  return {
    id: String(row.id),
    title: String(row.title),
    message: String(row.message),
    scheduled_time: String(row.scheduled_time).slice(0, 8),
    audience: normalizeAudience(row.audience),
    shift_group: normalizeShiftGroup(row.shift_group),
    priority: normalizePriority(row.priority),
    display_duration_seconds: normalizeDurationSeconds(row.display_duration_seconds),
    active_days: normalizeDays(row.active_days),
    requires_swing_handler: Boolean(row.requires_swing_handler),
    is_active: row.is_active !== false,
    footer_text: row.footer_text != null ? String(row.footer_text) : null,
    internal_notes: row.internal_notes != null ? String(row.internal_notes) : null,
    sort_order: row.sort_order == null ? null : Number(row.sort_order),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at)
  };
}

export function formatDailyReminderTime(time: string) {
  const [hoursRaw, minutesRaw] = time.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return time;
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function formatDailyReminderAudience(audience: DailyReminderAudience[]) {
  const hasHandler = audience.includes("dog_handler");
  const hasLead = audience.includes("team_lead");
  if (hasHandler && hasLead) return "Dog Handlers + Team Leads";
  if (hasLead) return "Team Leads";
  return "Dog Handlers";
}

export function formatDailyReminderShiftGroup(shiftGroup: DailyReminderShiftGroup) {
  return DAILY_REMINDER_SHIFT_GROUP_OPTIONS.find((option) => option.value === shiftGroup)?.label ?? shiftGroup;
}

export function audienceLabel(audience: DailyReminderAudience[]) {
  return formatDailyReminderAudience(audience);
}

export function getZonedParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "long"
  });
  const parts = formatter.formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: lookup.year ?? "1970",
    month: lookup.month ?? "01",
    day: lookup.day ?? "01",
    hour: Number(lookup.hour ?? 0),
    minute: Number(lookup.minute ?? 0),
    second: Number(lookup.second ?? 0),
    weekday: (lookup.weekday ?? "Sunday").toLowerCase()
  };
}

export function getShiftDate(timeZone: string, now = new Date()) {
  const parts = getZonedParts(now, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function getDayKey(timeZone: string, now = new Date()) {
  const parts = getZonedParts(now, timeZone);
  return parts.weekday;
}

function minutesFromTime(time: string) {
  const [hoursRaw, minutesRaw] = time.split(":");
  return Number(hoursRaw) * 60 + Number(minutesRaw);
}

function zonedMinutesNow(timeZone: string, now = new Date()) {
  const parts = getZonedParts(now, timeZone);
  return parts.hour * 60 + parts.minute;
}

export function isReminderScheduledToday(reminder: Pick<DailyReminder, "active_days">, dayKey: string) {
  return reminder.active_days.map((day) => day.toLowerCase()).includes(dayKey.toLowerCase());
}

export function targetsDogHandlers(reminder: Pick<DailyReminder, "audience">) {
  return reminder.audience.includes("dog_handler");
}

export function isReminderDue(
  reminder: Pick<DailyReminder, "scheduled_time" | "audience">,
  timeZone: string,
  now = new Date()
) {
  const nowMinutes = zonedMinutesNow(timeZone, now);
  const scheduledMinutes = minutesFromTime(reminder.scheduled_time);
  if (targetsDogHandlers(reminder) && nowMinutes < MIN_DOG_HANDLER_MINUTES) return false;
  return nowMinutes >= scheduledMinutes;
}

function nextScheduledSendIso(
  reminder: Pick<DailyReminder, "scheduled_time" | "active_days" | "is_active">,
  timeZone: string,
  now = new Date()
) {
  if (!reminder.is_active) return null;
  const parts = getZonedParts(now, timeZone);
  const [hours, minutes] = reminder.scheduled_time.split(":").map(Number);
  for (let offset = 0; offset < 8; offset += 1) {
    const probe = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000);
    const probeParts = getZonedParts(probe, timeZone);
    const dayKey = probeParts.weekday;
    if (!isReminderScheduledToday(reminder, dayKey)) continue;
    const date = `${probeParts.year}-${probeParts.month}-${probeParts.day}`;
    const local = new Date(`${date}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`);
    const utcGuess = Date.parse(local.toISOString());
    if (offset === 0) {
      const nowMinutes = parts.hour * 60 + parts.minute;
      const scheduledMinutes = hours * 60 + minutes;
      if (nowMinutes > scheduledMinutes) continue;
    }
    if (!Number.isNaN(utcGuess)) return new Date(utcGuess).toISOString();
    return `${date}T${reminder.scheduled_time}`;
  }
  return null;
}

function mapReminderPriority(priority: DailyReminderPriority): StaffPushNoticePriority {
  if (priority === "important") return "important";
  return "normal";
}

export function buildDailyReminderPushNoticeInput(
  reminder: DailyReminder,
  sentType: DailyReminderSendType,
  sentByName?: string | null
): StaffPushNoticeInput {
  const durationMinutes = Math.max(1, Math.round(reminder.display_duration_seconds / 60));
  return {
    title: reminder.title,
    message: reminder.message,
    priority: mapReminderPriority(reminder.priority),
    display_mode: reminder.priority === "important" ? "normal" : "normal",
    display_duration_minutes: durationMinutes,
    notice_type: "daily_reminder",
    daily_reminder_id: reminder.id,
    daily_reminder_sent_type: sentType,
    daily_reminder_scheduled_time: reminder.scheduled_time,
    daily_reminder_audience: reminder.audience,
    daily_reminder_sent_by_name: sentByName ?? null,
    daily_reminder_footer: reminder.footer_text || DEFAULT_DAILY_REMINDER_FOOTER,
    source: "daily_reminder",
    source_id: reminder.id
  };
}

export async function loadSwingHandlerPresent(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("admin_settings").select("settings").eq("id", "default").maybeSingle();
  if (error) {
    if (isMissingRelation(error)) return false;
    throw error;
  }
  const settings = (data?.settings ?? {}) as Record<string, unknown>;
  return Boolean(settings[SWING_HANDLER_SETTINGS_KEY]);
}

export async function setSwingHandlerPresent(supabase: SupabaseClient, present: boolean) {
  const { data, error } = await supabase.from("admin_settings").select("settings").eq("id", "default").maybeSingle();
  if (error) throw error;
  const settings = {
    ...((data?.settings ?? {}) as Record<string, unknown>),
    [SWING_HANDLER_SETTINGS_KEY]: present
  };
  const { error: saveError } = await supabase
    .from("admin_settings")
    .upsert({ id: "default", settings, updated_at: new Date().toISOString() });
  if (saveError) throw saveError;
  return present;
}

export async function hasBlockingHigherPriorityContent(supabase: SupabaseClient) {
  const grooming = await loadGroomingPushBoardState(supabase);
  if (grooming.activeNotice) return true;
  const active = await loadActiveStaffPushNotice(supabase);
  if (!active) return false;
  if (isDogHandlerComplaintNotice(active) || active.priority === "urgent") return true;
  return false;
}

type DailyStateRow = {
  id: string;
  daily_reminder_id: string;
  shift_date: string;
  status: string;
  sent_at: string | null;
  sent_by_user_id: string | null;
  sent_by_name: string | null;
  push_notice_id: string | null;
};

function mapTodayStatus(
  reminder: DailyReminder,
  dayKey: string,
  swingHandlerPresent: boolean,
  state: DailyStateRow | null
): DailyReminderTodayStatus {
  if (!reminder.is_active) return "inactive";
  if (!isReminderScheduledToday(reminder, dayKey)) return "not_scheduled_today";
  if (reminder.requires_swing_handler && !swingHandlerPresent) return "swing_handler_off";
  if (!state) return "pending_today";
  if (state.status === "sent_early") return "sent_early_today";
  if (state.status === "sent_automatic") return "sent_automatic_today";
  if (state.status === "force_resend") return "force_resent_today";
  if (state.status === "queued") return "queued_today";
  if (state.status === "skipped") return "skipped_today";
  return "pending_today";
}

function sendEarlyDisabledReason(
  reminder: DailyReminder,
  status: DailyReminderTodayStatus,
  canForceResend: boolean
) {
  if (!reminder.is_active) return "Enable this reminder before sending.";
  if (status === "sent_early_today" || status === "sent_automatic_today" || status === "force_resent_today") {
    return "Already sent today.";
  }
  if (status === "not_scheduled_today") return "Not scheduled today.";
  if (status === "swing_handler_off") return "Swing handler is not marked present today.";
  if (status === "queued_today") return "Reminder is queued and will display when higher-priority notices clear.";
  if (status !== "pending_today" && !canForceResend) return "Already sent today.";
  return null;
}

async function loadTodayStates(supabase: SupabaseClient, shiftDate: string) {
  const { data, error } = await supabase
    .from("daily_reminder_daily_state")
    .select("*")
    .eq("shift_date", shiftDate);
  if (error) {
    if (isMissingRelation(error)) return new Map<string, DailyStateRow>();
    throw error;
  }
  return new Map((data ?? []).map((row) => [String(row.daily_reminder_id), row as DailyStateRow]));
}

async function loadLastSends(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("daily_reminder_sends")
    .select("*")
    .order("sent_at", { ascending: false })
    .limit(500);
  if (error) {
    if (isMissingRelation(error)) return new Map<string, DailyReminderSend>();
    throw error;
  }
  const map = new Map<string, DailyReminderSend>();
  for (const row of data ?? []) {
    const reminderId = String(row.daily_reminder_id);
    if (!map.has(reminderId)) {
      map.set(reminderId, row as DailyReminderSend);
    }
  }
  return map;
}

export async function listDailyRemindersWithState(
  supabase: SupabaseClient,
  options?: { canForceResend?: boolean; timeZone?: string }
) {
  const settings = await loadAdminSettings(supabase);
  const timeZone = options?.timeZone ?? settings.timezone;
  const now = new Date();
  const shiftDate = getShiftDate(timeZone, now);
  const dayKey = getDayKey(timeZone, now);
  const swingHandlerPresent = await loadSwingHandlerPresent(supabase);

  const { data, error } = await supabase
    .from("daily_reminders")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("scheduled_time", { ascending: true });
  if (error) {
    if (isMissingRelation(error)) return { reminders: [] as DailyReminderRow[], shiftDate, swingHandlerPresent };
    throw error;
  }

  const [todayStates, lastSends] = await Promise.all([
    loadTodayStates(supabase, shiftDate),
    loadLastSends(supabase)
  ]);

  const reminders = (data ?? []).map((row) => {
    const reminder = rowToReminder(row as Record<string, unknown>);
    const state = todayStates.get(reminder.id) ?? null;
    const todayStatus = mapTodayStatus(reminder, dayKey, swingHandlerPresent, state);
    const lastSend = lastSends.get(reminder.id) ?? null;
    const disabledReason = sendEarlyDisabledReason(reminder, todayStatus, Boolean(options?.canForceResend));
    return {
      ...reminder,
      today_status: todayStatus,
      last_sent_at: lastSend?.sent_at ?? state?.sent_at ?? null,
      last_sent_type: (lastSend?.sent_type as DailyReminderSendType | null) ?? null,
      next_scheduled_send: nextScheduledSendIso(reminder, timeZone, now),
      today_state_id: state?.id ?? null,
      can_send_early: !disabledReason,
      send_early_disabled_reason: disabledReason
    } satisfies DailyReminderRow;
  });

  return { reminders, shiftDate, swingHandlerPresent, timeZone };
}

export function normalizeDailyReminderInput(input: Record<string, unknown>) {
  const title = sanitizeText(input.title, 120);
  const message = sanitizeText(input.message, 600);
  if (!title) throw new Error("Reminder title is required.");
  if (!message) throw new Error("Reminder message is required.");
  return {
    title,
    message,
    scheduled_time: normalizeTime(input.scheduled_time),
    audience: normalizeAudience(input.audience),
    shift_group: normalizeShiftGroup(input.shift_group),
    priority: normalizePriority(input.priority),
    display_duration_seconds: normalizeDurationSeconds(input.display_duration_seconds),
    active_days: normalizeDays(input.active_days),
    requires_swing_handler: Boolean(input.requires_swing_handler),
    is_active: input.is_active !== false,
    footer_text: sanitizeText(input.footer_text, 200) || null,
    internal_notes: sanitizeText(input.internal_notes, 400) || null,
    sort_order: input.sort_order == null ? null : Number(input.sort_order)
  };
}

export async function updateDailyReminder(
  supabase: SupabaseClient,
  id: string,
  input: Record<string, unknown>
) {
  const patch = normalizeDailyReminderInput(input);
  const { data, error } = await supabase
    .from("daily_reminders")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Daily reminder not found.");
  return rowToReminder(data as Record<string, unknown>);
}

export async function duplicateDailyReminder(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase.from("daily_reminders").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Daily reminder not found.");
  const source = rowToReminder(data as Record<string, unknown>);
  const { data: created, error: insertError } = await supabase
    .from("daily_reminders")
    .insert({
      title: `${source.title} (Copy)`,
      message: source.message,
      scheduled_time: source.scheduled_time,
      audience: source.audience,
      shift_group: source.shift_group,
      priority: source.priority,
      display_duration_seconds: source.display_duration_seconds,
      active_days: source.active_days,
      requires_swing_handler: source.requires_swing_handler,
      is_active: false,
      footer_text: source.footer_text,
      internal_notes: source.internal_notes,
      sort_order: (source.sort_order ?? 0) + 1
    })
    .select("*")
    .single();
  if (insertError) throw insertError;
  return rowToReminder(created as Record<string, unknown>);
}

export async function disableDailyReminder(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase
    .from("daily_reminders")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Daily reminder not found.");
  return rowToReminder(data as Record<string, unknown>);
}

async function recordSkippedSend(
  supabase: SupabaseClient,
  reminderId: string,
  shiftDate: string,
  skippedReason: string
) {
  await supabase.from("daily_reminder_sends").insert({
    daily_reminder_id: reminderId,
    shift_date: shiftDate,
    sent_type: "automatic",
    skipped_reason: skippedReason
  });
}

async function claimDailyReminderSend(
  supabase: SupabaseClient,
  reminder: DailyReminder,
  shiftDate: string,
  sentType: DailyReminderSendType,
  actor: { userId?: string | null; name?: string | null },
  allowForce = false
) {
  const status =
    sentType === "early"
      ? "sent_early"
      : sentType === "force_resend"
        ? "force_resend"
        : "sent_automatic";

  const { data: existing, error: existingError } = await supabase
    .from("daily_reminder_daily_state")
    .select("*")
    .eq("daily_reminder_id", reminder.id)
    .eq("shift_date", shiftDate)
    .maybeSingle();
  if (existingError && !isMissingRelation(existingError)) throw existingError;

  if (existing) {
    if (
      !allowForce &&
      (existing.status === "sent_early" ||
        existing.status === "sent_automatic" ||
        existing.status === "force_resend" ||
        existing.status === "queued")
    ) {
      return { claimed: false as const, reason: "already_sent_today" as const, state: existing as DailyStateRow };
    }
    if (!allowForce && sentType !== "force_resend") {
      return { claimed: false as const, reason: "already_sent_today" as const, state: existing as DailyStateRow };
    }
  }

  const now = new Date().toISOString();
  const upsertPayload = {
    daily_reminder_id: reminder.id,
    shift_date: shiftDate,
    status,
    sent_at: now,
    sent_by_user_id: actor.userId ?? null,
    sent_by_name: actor.name ?? null,
    updated_at: now
  };

  const { data: state, error: stateError } = await supabase
    .from("daily_reminder_daily_state")
    .upsert(upsertPayload, { onConflict: "daily_reminder_id,shift_date" })
    .select("*")
    .single();
  if (stateError) {
    if (stateError.code === "23505") {
      return { claimed: false as const, reason: "already_sent_today" as const, state: null };
    }
    throw stateError;
  }

  const { error: sendError } = await supabase.from("daily_reminder_sends").insert({
    daily_reminder_id: reminder.id,
    shift_date: shiftDate,
    sent_type: sentType,
    sent_by_user_id: actor.userId ?? null,
    sent_by_name: actor.name ?? null
  });
  if (sendError && sendError.code !== "23505") throw sendError;

  return { claimed: true as const, state: state as DailyStateRow };
}

export async function deliverDailyReminderPush(
  supabase: SupabaseClient,
  reminder: DailyReminder,
  options: {
    sentType: DailyReminderSendType;
    shiftDate: string;
    actor?: { userId?: string | null; name?: string | null; label?: string | null };
    allowForce?: boolean;
    queueWhenBlocked?: boolean;
  }
) {
  const actorLabel = options.actor?.name ?? options.actor?.label ?? "scheduler";
  const claim = await claimDailyReminderSend(
    supabase,
    reminder,
    options.shiftDate,
    options.sentType,
    { userId: options.actor?.userId ?? null, name: actorLabel },
    options.allowForce
  );
  if (!claim.claimed) {
    return { delivered: false as const, reason: claim.reason, notice: null as StaffPushNotice | null };
  }

  const blocked = await hasBlockingHigherPriorityContent(supabase);
  if (blocked && options.queueWhenBlocked !== false && options.sentType === "automatic") {
    await supabase
      .from("daily_reminder_daily_state")
      .update({ status: "queued", push_notice_id: null, updated_at: new Date().toISOString() })
      .eq("id", claim.state.id);
    return { delivered: false as const, reason: "queued" as const, notice: null as StaffPushNotice | null };
  }

  const notice = await createAndPushStaffNotice(
    supabase,
    buildDailyReminderPushNoticeInput(reminder, options.sentType, actorLabel),
    actorLabel
  );

  await supabase
    .from("daily_reminder_daily_state")
    .update({
      push_notice_id: notice.id,
      status:
        options.sentType === "early"
          ? "sent_early"
          : options.sentType === "force_resend"
            ? "force_resend"
            : "sent_automatic",
      updated_at: new Date().toISOString()
    })
    .eq("id", claim.state.id);

  await supabase
    .from("daily_reminder_sends")
    .update({ push_notice_id: notice.id })
    .eq("daily_reminder_id", reminder.id)
    .eq("shift_date", options.shiftDate)
    .eq("sent_type", options.sentType);

  return { delivered: true as const, notice };
}

export async function sendDailyReminderEarly(
  supabase: SupabaseClient,
  id: string,
  actor: { userId?: string | null; name?: string | null }
) {
  const settings = await loadAdminSettings(supabase);
  const timeZone = settings.timezone;
  const shiftDate = getShiftDate(timeZone);
  const dayKey = getDayKey(timeZone);
  const swingHandlerPresent = await loadSwingHandlerPresent(supabase);

  const { data, error } = await supabase.from("daily_reminders").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Daily reminder not found.");
  const reminder = rowToReminder(data as Record<string, unknown>);

  if (!reminder.is_active) throw new Error("Enable this reminder before sending.");
  if (!isReminderScheduledToday(reminder, dayKey)) throw new Error("This reminder is not scheduled for today.");
  if (reminder.requires_swing_handler && !swingHandlerPresent) {
    throw new Error("Swing handler must be marked present before sending this reminder.");
  }

  const result = await deliverDailyReminderPush(supabase, reminder, {
    sentType: "early",
    shiftDate,
    actor,
    queueWhenBlocked: false
  });

  if (!result.delivered && result.reason === "already_sent_today") {
    throw new Error("This reminder was already sent today.");
  }

  return result;
}

export async function sendDueDailyReminders(supabase: SupabaseClient, timeZone?: string) {
  const settings = await loadAdminSettings(supabase);
  const zone = timeZone ?? settings.timezone;
  const now = new Date();
  const shiftDate = getShiftDate(zone, now);
  const dayKey = getDayKey(zone, now);
  const swingHandlerPresent = await loadSwingHandlerPresent(supabase);

  const summary: SendDueDailyRemindersResult = {
    sent_count: 0,
    skipped_count: 0,
    skipped_sent_early_count: 0,
    skipped_already_sent_count: 0,
    skipped_inactive_count: 0,
    skipped_not_due_count: 0,
    skipped_swing_handler_count: 0,
    queued_count: 0,
    error_count: 0,
    errors: []
  };

  const { data, error } = await supabase
    .from("daily_reminders")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("scheduled_time", { ascending: true });
  if (error) {
    if (isMissingRelation(error)) return summary;
    throw error;
  }

  const todayStates = await loadTodayStates(supabase, shiftDate);

  for (const row of data ?? []) {
    const reminder = rowToReminder(row as Record<string, unknown>);
    try {
      if (!isReminderScheduledToday(reminder, dayKey)) {
        summary.skipped_count += 1;
        continue;
      }
      if (reminder.requires_swing_handler && !swingHandlerPresent) {
        summary.skipped_swing_handler_count += 1;
        summary.skipped_count += 1;
        continue;
      }
      if (!isReminderDue(reminder, zone, now)) {
        summary.skipped_not_due_count += 1;
        summary.skipped_count += 1;
        continue;
      }

      const existing = todayStates.get(reminder.id);
      if (existing?.status === "sent_early") {
        summary.skipped_sent_early_count += 1;
        summary.skipped_count += 1;
        await recordSkippedSend(supabase, reminder.id, shiftDate, "sent_early_today");
        continue;
      }
      if (
        existing &&
        (existing.status === "sent_automatic" ||
          existing.status === "force_resend" ||
          existing.status === "queued")
      ) {
        summary.skipped_already_sent_count += 1;
        summary.skipped_count += 1;
        continue;
      }

      const result = await deliverDailyReminderPush(supabase, reminder, {
        sentType: "automatic",
        shiftDate,
        actor: { label: "daily-reminder-scheduler" },
        queueWhenBlocked: true
      });

      if (result.delivered) {
        summary.sent_count += 1;
      } else if (result.reason === "queued") {
        summary.queued_count += 1;
        summary.skipped_count += 1;
      } else if (result.reason === "already_sent_today") {
        summary.skipped_already_sent_count += 1;
        summary.skipped_count += 1;
      }
    } catch (itemError) {
      summary.error_count += 1;
      summary.errors.push(
        itemError instanceof Error ? `${reminder.title}: ${itemError.message}` : `${reminder.title}: failed`
      );
    }
  }

  return summary;
}

export async function releaseQueuedDailyReminders(supabase: SupabaseClient, timeZone?: string) {
  const settings = await loadAdminSettings(supabase);
  const zone = timeZone ?? settings.timezone;
  const shiftDate = getShiftDate(zone);
  if (await hasBlockingHigherPriorityContent(supabase)) return { released: 0 };

  const { data, error } = await supabase
    .from("daily_reminder_daily_state")
    .select("*, daily_reminders(*)")
    .eq("shift_date", shiftDate)
    .eq("status", "queued")
    .order("sent_at", { ascending: true });
  if (error) {
    if (isMissingRelation(error)) return { released: 0 };
    throw error;
  }

  let released = 0;
  for (const row of data ?? []) {
    const reminder = rowToReminder((row as { daily_reminders: Record<string, unknown> }).daily_reminders);
    const notice = await createAndPushStaffNotice(
      supabase,
      buildDailyReminderPushNoticeInput(reminder, "automatic", "daily-reminder-scheduler"),
      "daily-reminder-scheduler"
    );
    await supabase
      .from("daily_reminder_daily_state")
      .update({
        status: "sent_automatic",
        push_notice_id: notice.id,
        sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", String(row.id));
    await supabase
      .from("daily_reminder_sends")
      .update({ push_notice_id: notice.id })
      .eq("daily_reminder_id", reminder.id)
      .eq("shift_date", shiftDate)
      .eq("sent_type", "automatic");
    released += 1;
    break;
  }
  return { released };
}

export async function getDailyReminderHistory(
  supabase: SupabaseClient,
  options?: { reminderId?: string; limit?: number }
) {
  let query = supabase
    .from("daily_reminder_sends")
    .select("*, daily_reminders(title, scheduled_time)")
    .order("sent_at", { ascending: false })
    .limit(options?.limit ?? 100);
  if (options?.reminderId) query = query.eq("daily_reminder_id", options.reminderId);
  const { data, error } = await query;
  if (error) {
    if (isMissingRelation(error)) return [];
    throw error;
  }
  return (data ?? []).map((row) => ({
    ...(row as DailyReminderSend),
    reminder_title: (row as { daily_reminders?: { title?: string } }).daily_reminders?.title ?? null,
    reminder_scheduled_time:
      (row as { daily_reminders?: { scheduled_time?: string } }).daily_reminders?.scheduled_time ?? null
  }));
}

export { DAY_KEYS };
