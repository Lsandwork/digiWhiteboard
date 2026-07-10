import { createHash } from "crypto";
import { getServiceSupabase } from "@/lib/supabase/server";
import type { LiveDog } from "@/lib/types";

export const SHELLY_ALERT_TYPES = [
  "dog_check_in",
  "dog_check_out",
  "grooming_push",
  "owner_complaint",
  "phone_usage",
  "dog_not_on_yard",
  "daily_reminder",
  "custom_push_notice",
  "cast_video_push",
  "urgent_front_desk",
  "test_light"
] as const;

export type ShellyAlertType = (typeof SHELLY_ALERT_TYPES)[number];

/** Push-notice alerts stay on for 5 minutes unless cleared manually. */
export const SHELLY_PUSH_NOTICE_ALERT_DURATION_SECONDS = 300;
/** A dog entering Checking In keeps the alert light on for 2 minutes unless cleared manually. */
export const SHELLY_CHECKIN_ALERT_DURATION_SECONDS = 120;
/** A dog entering Checking Out keeps the alert light on for 2 minutes unless cleared manually. */
export const SHELLY_CHECKOUT_ALERT_DURATION_SECONDS = 120;

const SUSTAINED_PUSH_NOTICE_TYPES = new Set<ShellyAlertType>([
  "owner_complaint",
  "phone_usage",
  "dog_not_on_yard",
  "daily_reminder",
  "custom_push_notice",
  "urgent_front_desk"
]);

const SHELLY_ALERT_DURATIONS: Record<ShellyAlertType, number> = {
  dog_check_in: SHELLY_CHECKIN_ALERT_DURATION_SECONDS,
  dog_check_out: SHELLY_CHECKOUT_ALERT_DURATION_SECONDS,
  grooming_push: 6,
  owner_complaint: SHELLY_PUSH_NOTICE_ALERT_DURATION_SECONDS,
  phone_usage: SHELLY_PUSH_NOTICE_ALERT_DURATION_SECONDS,
  dog_not_on_yard: SHELLY_PUSH_NOTICE_ALERT_DURATION_SECONDS,
  daily_reminder: SHELLY_PUSH_NOTICE_ALERT_DURATION_SECONDS,
  custom_push_notice: SHELLY_PUSH_NOTICE_ALERT_DURATION_SECONDS,
  cast_video_push: 6,
  urgent_front_desk: SHELLY_PUSH_NOTICE_ALERT_DURATION_SECONDS,
  test_light: 5
};

// Shelly's EU cloud regularly takes longer than 2.5s from Vercel's US region.
// Keep the request bounded, but leave enough room for a real device response.
export const SHELLY_API_TIMEOUT_MS = 8000;

type ShellyConfig = {
  enabled: boolean;
  cloudHost: string;
  authKey: string;
  deviceId: string;
  channel: number;
  minSecondsBetween: number;
};

export type ShellyAlertResult = {
  ok: boolean;
  skipped?: "disabled" | "unconfigured" | "duplicate" | "rate_limited";
  error?: string;
};

export function shellyCheckoutAlertKey(
  dog: Pick<LiveDog, "id" | "status_started_at" | "updated_at">
) {
  const transitionStartedAt = dog.status_started_at ?? dog.updated_at;
  return `checkout:${dog.id}:${transitionStartedAt}`;
}

export function shellyCheckinAlertKey(
  dog: Pick<LiveDog, "id" | "gingr_reservation_id" | "gingr_animal_id" | "status_started_at" | "updated_at">
) {
  const transitionStartedAt = dog.status_started_at ?? dog.updated_at;
  if (dog.gingr_reservation_id) {
    return `checkin:reservation:${dog.gingr_reservation_id}`;
  }
  if (dog.gingr_animal_id) {
    return `checkin:animal:${dog.gingr_animal_id}:${transitionStartedAt}`;
  }
  return `checkin:row:${dog.id}:${transitionStartedAt}`;
}

function parseBoolean(value: string | undefined, fallback = false) {
  if (value == null || value.trim() === "") return fallback;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function pushNoticeDurationSeconds() {
  return parsePositiveInt(process.env.SHELLY_PUSH_NOTICE_DURATION_SECONDS, SHELLY_PUSH_NOTICE_ALERT_DURATION_SECONDS);
}

function durationForAlertType(type: ShellyAlertType) {
  if (SUSTAINED_PUSH_NOTICE_TYPES.has(type)) {
    return pushNoticeDurationSeconds();
  }
  return SHELLY_ALERT_DURATIONS[type];
}

function loadShellyConfig(): ShellyConfig | null {
  const enabled = parseBoolean(process.env.SHELLY_ALERT_ENABLED, false);
  if (!enabled) return null;

  const cloudHost = process.env.SHELLY_CLOUD_HOST?.trim().replace(/\/$/, "");
  const authKey = process.env.SHELLY_AUTH_KEY?.trim();
  const deviceId = process.env.SHELLY_DEVICE_ID?.trim();

  if (!cloudHost || !authKey || !deviceId) return null;

  return {
    enabled: true,
    cloudHost,
    authKey,
    deviceId,
    channel: parsePositiveInt(process.env.SHELLY_CHANNEL, 0),
    minSecondsBetween: parsePositiveInt(process.env.SHELLY_MIN_SECONDS_BETWEEN_ALERTS, 0)
  };
}

export function isShellyAlertConfigured() {
  return loadShellyConfig() !== null;
}

function isShellyAlertType(value: unknown): value is ShellyAlertType {
  return typeof value === "string" && (SHELLY_ALERT_TYPES as readonly string[]).includes(value);
}

function isDuplicateKeyError(error: { code?: string; message?: string } | null) {
  return error?.code === "23505" || Boolean(error?.message?.includes("shelly_alert_log_alert_key"));
}

function isMissingShellyLogTable(error: { code?: string; message?: string } | null) {
  return error?.code === "42P01" || error?.code === "PGRST205" || Boolean(error?.message?.includes("shelly_alert_log"));
}

async function claimShellyAlertKey(alertKey: string, alertType: ShellyAlertType) {
  const supabase = getServiceSupabase();
  const { error } = await supabase.from("shelly_alert_log").insert({
    alert_key: alertKey,
    alert_type: alertType
  });

  if (!error) return { claimed: true as const };
  if (isDuplicateKeyError(error)) return { claimed: false as const, reason: "duplicate" as const };
  if (isMissingShellyLogTable(error)) return { claimed: true as const, missingTable: true as const };
  console.error("[shelly-alert] Unable to record alert key:", error.message);
  return { claimed: true as const, missingTable: true as const };
}

async function releaseShellyAlertKey(alertKey: string) {
  const supabase = getServiceSupabase();
  const { error } = await supabase.from("shelly_alert_log").delete().eq("alert_key", alertKey);
  if (error && !isMissingShellyLogTable(error)) {
    console.error("[shelly-alert] Unable to release failed alert key:", error.message);
  }
}

async function isRateLimited(minSecondsBetween: number, currentAlertKey: string) {
  if (minSecondsBetween <= 0) return false;

  const supabase = getServiceSupabase();
  const since = new Date(Date.now() - minSecondsBetween * 1000).toISOString();
  const { data, error } = await supabase
    .from("shelly_alert_log")
    .select("alert_key, created_at")
    .neq("alert_key", currentAlertKey)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    if (isMissingShellyLogTable(error)) return false;
    console.error("[shelly-alert] Rate-limit lookup failed:", error.message);
    return false;
  }

  return Boolean(data?.length);
}

async function callShellySetSwitch(
  config: ShellyConfig,
  payload: { on: boolean; toggleAfterSeconds?: number }
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SHELLY_API_TIMEOUT_MS);
  const url = `${config.cloudHost}/v2/devices/api/set/switch?auth_key=${encodeURIComponent(config.authKey)}`;

  const body: Record<string, unknown> = {
    id: config.deviceId,
    channel: config.channel,
    on: payload.on
  };
  if (payload.on && payload.toggleAfterSeconds && payload.toggleAfterSeconds > 0) {
    body.toggle_after = payload.toggleAfterSeconds;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    const bodyText = await response.text().catch(() => "");
    let parsed: { error?: string; message?: string } | null = null;
    if (bodyText) {
      try {
        parsed = JSON.parse(bodyText) as { error?: string; message?: string };
      } catch {
        parsed = null;
      }
    }

    const shellyError = parsed?.error ?? parsed?.message;
    if (!response.ok || shellyError) {
      const detail = shellyError ?? (bodyText ? bodyText.slice(0, 200) : "");
      throw new Error(
        shellyError
          ? `Shelly error: ${shellyError}`
          : `Shelly API returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`
      );
    }
  } finally {
    clearTimeout(timer);
  }
}

export async function triggerShellyAlert(type: ShellyAlertType, eventKey: string): Promise<ShellyAlertResult> {
  const normalizedKey = String(eventKey ?? "").trim();
  if (!normalizedKey) {
    return { ok: false, error: "Missing Shelly event key." };
  }

  const config = loadShellyConfig();
  if (!config) {
    if (!parseBoolean(process.env.SHELLY_ALERT_ENABLED, false)) {
      return { ok: false, skipped: "disabled" };
    }
    return { ok: false, skipped: "unconfigured" };
  }

  if (await isRateLimited(config.minSecondsBetween, normalizedKey)) {
    console.info(`[shelly-alert] ${type} (${normalizedKey}) waiting for rate-limit retry.`);
    return { ok: false, skipped: "rate_limited" };
  }

  const claim = await claimShellyAlertKey(normalizedKey, type);
  if (!claim.claimed) {
    return { ok: false, skipped: "duplicate" };
  }

  const durationSeconds = durationForAlertType(type);
  try {
    await callShellySetSwitch(config, { on: true, toggleAfterSeconds: durationSeconds });
    console.info(`[shelly-alert] ${type} (${normalizedKey}) on for ${durationSeconds}s.`);
    return { ok: true };
  } catch (error) {
    if (!claim.missingTable) {
      await releaseShellyAlertKey(normalizedKey);
    }
    const message = error instanceof Error ? error.message : "Shelly alert request failed.";
    console.error(`[shelly-alert] ${type} (${normalizedKey}) failed:`, message);
    return { ok: false, error: message };
  }
}

export async function clearShellyAlert(reason = "manual_clear"): Promise<ShellyAlertResult> {
  const config = loadShellyConfig();
  if (!config) {
    if (!parseBoolean(process.env.SHELLY_ALERT_ENABLED, false)) {
      return { ok: false, skipped: "disabled" };
    }
    return { ok: false, skipped: "unconfigured" };
  }

  try {
    await callShellySetSwitch(config, { on: false });
    console.info(`[shelly-alert] Alert light cleared (${reason}).`);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Shelly clear request failed.";
    console.error(`[shelly-alert] Clear failed (${reason}):`, message);
    return { ok: false, error: message };
  }
}

export function clearShellyAlertFireAndForget(reason = "manual_clear") {
  void clearShellyAlert(reason).catch((error) => {
    const message = error instanceof Error ? error.message : "Shelly clear failed.";
    console.error(`[shelly-alert] Fire-and-forget clear failed:`, message);
  });
}

export function triggerShellyAlertFireAndForget(type: ShellyAlertType, eventKey: string) {
  void triggerShellyAlert(type, eventKey).catch((error) => {
    const message = error instanceof Error ? error.message : "Shelly alert failed.";
    console.error(`[shelly-alert] Fire-and-forget ${type} failed:`, message);
  });
}

export function validateShellyFlashRequest(body: { type?: unknown; eventKey?: unknown }) {
  const type = body.type;
  if (!isShellyAlertType(type)) {
    return { ok: false as const, error: `Invalid Shelly alert type. Use one of: ${SHELLY_ALERT_TYPES.join(", ")}` };
  }

  const eventKey =
    typeof body.eventKey === "string" && body.eventKey.trim()
      ? body.eventKey.trim()
      : type === "test_light"
        ? `test-light:${Date.now()}`
        : "";

  if (!eventKey) {
    return { ok: false as const, error: "Missing eventKey." };
  }

  return { ok: true as const, type, eventKey };
}

export function shellyAuthKeyFingerprint() {
  const authKey = process.env.SHELLY_AUTH_KEY?.trim();
  if (!authKey) return null;
  return createHash("sha256").update(authKey).digest("hex").slice(0, 8);
}
