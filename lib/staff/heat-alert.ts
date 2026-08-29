import {
  createAndPushStaffNotice,
  loadActiveStaffPushNotice,
  type StaffPushNotice
} from "@/lib/staff/push-notices";
import { isUrgentPushAlert } from "@/lib/staff/super-admin-sms";
import {
  fetchSantaMonicaWeather,
  HEAT_ALERT_DURATION_MINUTES,
  HEAT_ALERT_MESSAGE,
  HEAT_ALERT_SOURCE,
  HEAT_ALERT_TEMP_F,
  HEAT_ALERT_TITLE,
  isHeatAlertTemp,
  pacificDateKey,
  type SantaMonicaWeather
} from "@/lib/staff/santa-monica-weather";
import { loadAdminSettingsJsonKey, saveAdminSettingsJsonKey } from "@/lib/admin/settings-json-store";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

const HEAT_ALERT_LAST_SENT_KEY = "heat_alert_last_sent_pacific_date";

export type HeatAlertRunResult = {
  ok: boolean;
  tempF: number | null;
  heatAlert: boolean;
  action: "pushed" | "skipped_cool" | "skipped_already_sent" | "skipped_other_urgent" | "skipped_active" | "error";
  noticeId?: string;
  detail?: string;
};

async function loadLastSentDate(supabase: SupabaseClient) {
  return loadAdminSettingsJsonKey(supabase, HEAT_ALERT_LAST_SENT_KEY, (value) => String(value ?? ""), "");
}

async function saveLastSentDate(supabase: SupabaseClient, dateKey: string) {
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

export async function evaluateAndPushHeatAlert(
  supabase: SupabaseClient,
  options?: { weather?: SantaMonicaWeather }
): Promise<HeatAlertRunResult> {
  try {
    const weather = options?.weather ?? (await fetchSantaMonicaWeather());
    const todayPacific = pacificDateKey();
    const [activeNotice, lastSentPacificDate] = await Promise.all([
      loadActiveStaffPushNotice(supabase, { mutate: false }),
      loadLastSentDate(supabase)
    ]);

    const decision = shouldSkipHeatAlertPush({
      weather,
      activeNotice,
      lastSentPacificDate: lastSentPacificDate || "",
      todayPacific
    });

    if (decision.skip) {
      return {
        ok: true,
        tempF: weather.tempF,
        heatAlert: weather.heatAlert,
        action: decision.action
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

    await saveLastSentDate(supabase, todayPacific).catch(() => undefined);

    return {
      ok: true,
      tempF: weather.tempF,
      heatAlert: true,
      action: "pushed",
      noticeId: notice.id,
      detail: `Pushed at ${Math.round(weather.tempF)}°F (threshold ${HEAT_ALERT_TEMP_F}°F).`
    };
  } catch (error) {
    return {
      ok: false,
      tempF: null,
      heatAlert: false,
      action: "error",
      detail: error instanceof Error ? error.message : "Heat alert evaluation failed."
    };
  }
}

export { isHeatAlertTemp, HEAT_ALERT_TEMP_F, HEAT_ALERT_TITLE, HEAT_ALERT_SOURCE };
