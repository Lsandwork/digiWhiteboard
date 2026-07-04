import { NextResponse } from "next/server";
import type { AdminBoardType } from "@/lib/admin/types";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { loadFastPromptedCheckouts } from "@/lib/board-fast-checkout";
import { getBoardEnvCheck } from "@/lib/env";
import { publicOrigin } from "@/lib/gingr";
import { loadAdminSettings } from "@/lib/admin/settings";
import { loadLobbySettings } from "@/lib/lobby/settings";
import { loadStaffBoardSettings } from "@/lib/staff/settings";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function parseBoardType(value: string | null): AdminBoardType {
  return value === "staff" ? "staff" : "lobby";
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const url = new URL(request.url);
  const board = parseBoardType(url.searchParams.get("board"));
  const supabase = getServiceSupabase();

  const [lobbySettings, staffSettings, adminSettings, promotions, checkouts, dogs, events, failedEvents] = await Promise.all([
    loadLobbySettings(supabase),
    loadStaffBoardSettings(supabase),
    loadAdminSettings(supabase),
    loadAllPromotions(supabase),
    loadFastPromptedCheckouts(supabase),
    supabase
      .from("live_transition_dogs")
      .select("*")
      .eq("hidden", false)
      .in("display_status", ["checking_in", "checking_out"])
      .order("updated_at", { ascending: false }),
    supabase
      .from("gingr_webhook_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("gingr_webhook_events")
      .select("*")
      .eq("processed", false)
      .order("created_at", { ascending: false })
      .limit(20)
  ]);

  const siteUrl = publicOrigin(request);
  const webhookUrl = `${siteUrl}/api/gingr/webhook`;

  return NextResponse.json({
    board,
    username: getAdminSessionFromRequest(request)?.email ?? "admin",
    session: getAdminSessionFromRequest(request),
    admin_settings: adminSettings,
    lobby_settings: lobbySettings,
    staff_settings: staffSettings,
    promotions: promotions ?? [],
    active_checkouts: checkouts.checking_out.length,
    lobby_checkouts_count: checkouts.checking_out.length,
    sync_status: checkouts.checking_out.length >= 0 ? "healthy" : "degraded",
    last_synced_at: checkouts.newest_checkout_at,
    data_source: "Supabase (Cached)",
    webhook_url: webhookUrl,
    events: events.data ?? [],
    failed_events: failedEvents.data ?? [],
    staff_dogs: dogs.data ?? [],
    env: getBoardEnvCheck()
  });
}

async function loadAllPromotions(supabase: ReturnType<typeof getServiceSupabase>) {
  const { data, error } = await supabase.from("lobby_promotions").select("*").order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
