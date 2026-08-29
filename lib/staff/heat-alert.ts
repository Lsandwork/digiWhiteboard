import { createAndPushStaffNotice, loadActiveStaffPushNotice, type StaffPushNotice } from "@/lib/staff/push-notices";
import { isUrgentPushAlert } from "@/lib/staff/super-admin-sms";
import {
  fetchSantaMonicaWeather,
  hasHeatAlertSentInMemory,
  HEAT_ALERT_DURATION_MINUTES,
  HEAT_ALERT_MESSAGE,
  HEAT_ALERT_SOURCE,
  HEAT_ALERT_TEMP_F,
  HEAT_ALERT_TITLE,
  isHeatAlertTemp,
  markHeatAlertSentInMemory,
  pacificDateKey,
  type SantaMonicaWeather
} from "@/lib/staff/santa-monica-weather";
import { loadAdminSettingsJsonKey, saveAdminSettingsJsonKey } from "@/lib/admin/settings-json-store";
import { getOrLoadTtlCache, getTtlCache, setTtlCache } from "@/lib/server-ttl-cache";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

/** Persistent day key in admin_settings JSON (single keyed read/write — never a table scan). */
const HEAT_ALERT_LAST_SENT_KEY = "heat_alert_last_sent_pacific_date";
/** Short process cache so repeated cron ticks after a cold miss don't re-hit Supabase. */
const HEAT_ALERT_LAST_SENT_CACHE_KEY = "staff:heat-alert-last-sent-date";
const HEAT_ALERT_LAST_SENT_CACHE_TTL_MS = 30 * 60_000;

export type HeatAlertRunResult = {
  ok: boolean;
  tempF: number | null;
  heatAlert: boolean;
  action: "pushed" | "skipped_cool" | "skipped_already_sent" | "skipped_other_urgent" | "skipped_active" | "error";
  noticeId?: string;
  detail?: string;
  supabaseReads?: number;
  supabaseWrites?: number;
};

async function loadLastSentDate(supabase: SupabaseClient): Promise<{ date: string; cacheHit: boolean }> {
  const cached = getTtlCache<string>(HEAT_ALERT_LAST_SENT_CACHE_KEY);
  if (cached !== null) return { date: cached, cacheHit: true };

  const value = await getOrLoadTtlCache(HEAT_ALERT_LAST_SENT_CACHE_KEY, HEAT_ALERT_LAST_SENT_CACHE_TTL_MS, async () => {
    const raw = await loadAdminSettingsJsonKey(supabase, HEAT_ALERT_LAST_SENT_KEY, (v) => String(v ?? ""), "");
    return raw || "";
  });
  return { date: value || "", cacheHit: false };
}

async function saveLastSentDate(supabase: SupabaseClient, dateKey: string) {
  setTtlCache(HEAT_ALERT_LAST_SENT_CACHE_KEY, dateKey, HEAT_ALERT_LAST_SENT_CACHE_TTL_MS);
  markHeatAlertSentInMemory(dateKey);
  await saveAdminSettingsJsonKey(supabase, HEAT_ALERT_LAST_SENT_KEY, dateKey);
}

export function shouldSkipHeatAlertPush(input: {
  weather: SantaMonicaWeather;
  activeNotice: StaffPushNotice | null;
  lastSentPacificDate: string;
  todayPacific: string;
}) {
  if (!input.weather.heatAlert) {
    return { skip: true as const, action: "skipped_cool" as const };
  }
  if (input.lastSentPacificDate === input.todayPacific) {
    return { skip: true as const, action: "skipped_already_sent" as const };
  }
  if (input.activeNotice?.source === HEAT_ALERT_SOURCE && input.activeNotice.is_active) {
    return { skip: true as const, action: "skipped_active" as const };
  }
  if (input.activeNotice && isUrgentPushAlert(input.activeNotice) && input.activeNotice.source !== HEAT_ALERT_SOURCE) {
    return { skip: true as const, action: "skipped_other_urgent" as const };
  }
  return { skip: false as const, action: "pushed" as const };
}

/**
 * Cron entry — minimize Supabase:
 * 1) cached weather (0 DB)
 * 2) if < 80°F → exit (0 DB)
 * 3) memory day key → exit (0 DB)
 * 4) one targeted admin_settings JSON key read for today's sent flag
 * 5) only if still needed: one active-notice read, then one push write + one key write
 */
export async function evaluateAndPushHeatAlert(
  supabase: SupabaseClient,
  options?: { weather?: SantaMonicaWeather }
): Promise<HeatAlertRunResult> {
  let supabaseReads = 0;
  let supabaseWrites = 0;

  try {
    const weather = options?.weather ?? (await fetchSantaMonicaWeather());
    if (!isHeatAlertTemp(weather.tempF)) {
      return {
        ok: true,
        tempF: weather.tempF,
        heatAlert: false,
        action: "skipped_cool",
        detail: "Below heat threshold — no Supabase access.",
        supabaseReads,
        supabaseWrites
      };
    }

    const todayPacific = pacificDateKey();
    if (hasHeatAlertSentInMemory(todayPacific)) {
      return {
        ok: true,
        tempF: weather.tempF,
        heatAlert: true,
        action: "skipped_already_sent",
        detail: "Memory idempotency key hit — no Supabase access.",
        supabaseReads,
        supabaseWrites
      };
    }

    const lastSentResult = await loadLastSentDate(supabase);
    if (!lastSentResult.cacheHit) supabaseReads += 1;
    const lastSentPacificDate = lastSentResult.date;
    if (lastSentPacificDate === todayPacific) {
      markHeatAlertSentInMemory(todayPacific);
      return {
        ok: true,
        tempF: weather.tempF,
        heatAlert: true,
        action: "skipped_already_sent",
        detail: lastSentResult.cacheHit
          ? "Process cache day-key hit."
          : "Targeted day-key already set.",
        supabaseReads,
        supabaseWrites
      };
    }

    // Only touch push-notice state when we are about to create today's alert.
    supabaseReads += 1;
    const activeNotice = await loadActiveStaffPushNotice(supabase, { mutate: false });
    const decision = shouldSkipHeatAlertPush({
      weather: { ...weather, heatAlert: true },
      activeNotice,
      lastSentPacificDate,
      todayPacific
    });

    if (decision.skip) {
      if (decision.action === "skipped_already_sent" || decision.action === "skipped_active") {
        markHeatAlertSentInMemory(todayPacific);
      }
      return {
        ok: true,
        tempF: weather.tempF,
        heatAlert: true,
        action: decision.action,
        supabaseReads,
        supabaseWrites
      };
    }

    const notice = await createAndPushStaffNotice(
      supabase,
      {
        title: HEAT_ALERT_TITLE,
        message: `${HEAT_ALERT_MESSAGE} Current: ${Math.round(weather.tempF)}°F.`,
        priority: "urgent",
        display_mode: "urgent",
        display_duration_minutes: HEAT_ALERT_DURATION_MINUTES,
        is_default: false,
        source: HEAT_ALERT_SOURCE,
        source_id: todayPacific
      },
      "heat_alert_cron"
    );
    // createAndPushStaffNotice performs notice persistence (+ SMS fire-and-forget).
    supabaseWrites += 1;

    await saveLastSentDate(supabase, todayPacific).catch(() => undefined);
    supabaseWrites += 1;

    return {
      ok: true,
      tempF: weather.tempF,
      heatAlert: true,
      action: "pushed",
      noticeId: notice.id,
      detail: `Pushed at ${Math.round(weather.tempF)}°F (threshold ${HEAT_ALERT_TEMP_F}°F).`,
      supabaseReads,
      supabaseWrites
    };
  } catch (error) {
    return {
      ok: false,
      tempF: null,
      heatAlert: false,
      action: "error",
      detail: error instanceof Error ? error.message : "Heat alert evaluation failed.",
      supabaseReads,
      supabaseWrites
    };
  }
}

export { isHeatAlertTemp, HEAT_ALERT_TEMP_F, HEAT_ALERT_TITLE, HEAT_ALERT_SOURCE };
