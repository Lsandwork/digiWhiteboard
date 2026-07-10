import type { LobbyEvent, LobbyPromotion, LobbySettings } from "@/lib/lobby/types";
import { LOBBY_CLASS_SCHEDULE } from "@/lib/lobby/class-schedule";
import { sanitizeLobbySettings } from "@/lib/lobby/validate";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

const defaultSettings: LobbySettings = {
  max_queue_count: 6,
  refresh_interval_ms: 5000,
  show_promotions: true,
  show_events: true,
  footer_message: "Thanks for being part of the Fitdog family. We'll take care of the rest.",
  lobby_message: "Thank you for letting us play, care & connect!",
  class_schedule: LOBBY_CLASS_SCHEDULE,
  published_version: "v1.0.0",
  published_at: null,
  published_by: null
};

export async function loadLobbySettings(supabase: SupabaseClient): Promise<LobbySettings> {
  try {
    const { data, error } = await supabase.from("lobby_settings").select("*").eq("id", "default").maybeSingle();
    if (error) {
      if (error.code === "42P01" || error.message.toLowerCase().includes("lobby_settings")) {
        return defaultSettings;
      }
      throw error;
    }
    if (!data) return defaultSettings;

    return sanitizeLobbySettings(data);
  } catch {
    return defaultSettings;
  }
}

export async function loadLobbyPromotions(supabase: SupabaseClient, now = new Date()) {
  const { data, error } = await supabase
    .from("lobby_promotions")
    .select("*")
    .eq("active", true)
    .order("sort_order", { ascending: true });

  if (error) throw error;

  return ((data ?? []) as LobbyPromotion[]).filter((promotion) => {
    const startsAt = promotion.starts_at ? new Date(promotion.starts_at) : null;
    const endsAt = promotion.ends_at ? new Date(promotion.ends_at) : null;
    if (startsAt && startsAt > now) return false;
    if (endsAt && endsAt < now) return false;
    return true;
  });
}

export async function loadLobbyEvents(supabase: SupabaseClient, now = new Date()) {
  const { data, error } = await supabase
    .from("lobby_events")
    .select("*")
    .eq("active", true)
    .order("sort_order", { ascending: true });

  if (error) throw error;

  return ((data ?? []) as LobbyEvent[]).filter((event) => {
    if (!event.event_at) return true;
    return new Date(event.event_at) >= now;
  });
}

export async function updateLobbySettings(
  supabase: SupabaseClient,
  patch: Partial<LobbySettings> & {
    refresh_interval_ms?: number;
    class_schedule?: LobbySettings["class_schedule"];
    published_version?: string;
    published_at?: string | null;
    published_by?: string | null;
  }
) {
  const refreshIntervalMs = patch.refresh_interval_ms
    ? Math.min(12_000, Math.max(4000, patch.refresh_interval_ms))
    : undefined;

  const { data, error } = await supabase
    .from("lobby_settings")
    .upsert({
      id: "default",
      ...patch,
      ...(refreshIntervalMs ? { refresh_interval_ms: refreshIntervalMs } : {}),
      updated_at: new Date().toISOString()
    })
    .select("*")
    .single();

  if (error) throw error;
  try {
    const { invalidateBoardSettingsCaches } = await import("@/lib/board-settings-cache");
    invalidateBoardSettingsCaches();
  } catch {
    // Cache invalidation is best-effort.
  }
  return data;
}
