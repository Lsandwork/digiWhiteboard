import type { LobbyEvent, LobbyPromotion, LobbySettings } from "@/lib/lobby/types";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

const defaultSettings: LobbySettings = {
  max_queue_count: 6,
  refresh_interval_ms: 5000,
  show_promotions: true,
  show_events: true,
  footer_message: "Thanks for being part of the Fitdog family. We'll take care of the rest.",
  lobby_message: "Thank you for letting us play, care & connect!"
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

    const refreshIntervalMs = Number(data.refresh_interval_ms ?? defaultSettings.refresh_interval_ms);
    return {
      max_queue_count: Math.min(6, Math.max(3, Number(data.max_queue_count ?? defaultSettings.max_queue_count))),
      refresh_interval_ms: Math.max(5000, refreshIntervalMs),
      show_promotions: Boolean(data.show_promotions ?? defaultSettings.show_promotions),
      show_events: Boolean(data.show_events ?? defaultSettings.show_events),
      footer_message: data.footer_message ?? defaultSettings.footer_message,
      lobby_message: data.lobby_message ?? defaultSettings.lobby_message
    };
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
  patch: Partial<LobbySettings> & { refresh_interval_ms?: number }
) {
  const refreshIntervalMs = patch.refresh_interval_ms
    ? Math.max(5000, patch.refresh_interval_ms)
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
  return data;
}
