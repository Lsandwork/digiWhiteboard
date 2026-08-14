import { NextResponse } from "next/server";
import type { AdminBoardType, StaffBoardSettings } from "@/lib/admin/types";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { DEFAULT_ADMIN_SETTINGS, loadAdminSettings } from "@/lib/admin/settings";
import { getUserAccess, migrateLegacyUserAccess } from "@/lib/admin/user-access";
import { getAdminUserById } from "@/lib/admin/users";
import { loadFastPromptedCheckouts } from "@/lib/board-fast-checkout";
import { getBoardEnvCheck } from "@/lib/env";
import { publicOrigin } from "@/lib/gingr";
import { LOBBY_CLASS_SCHEDULE } from "@/lib/lobby/class-schedule";
import type { LobbySettings } from "@/lib/lobby/types";
import { loadLobbySettings } from "@/lib/lobby/settings";
import { loadStaffBoardSettings } from "@/lib/staff/settings";
import { getServiceSupabase } from "@/lib/supabase/server";
import { DEMO_EMAIL, buildInitialDemoSandbox } from "@/lib/demo/constants";
import { isDemoSession } from "@/lib/demo/session";
import { demoSandboxToBoard, getDemoSandbox } from "@/lib/demo/store";
import { withTimeoutFallback } from "@/lib/server-ttl-cache";

export const dynamic = "force-dynamic";

const DEMO_DASHBOARD_TIMEOUT_MS = 2_500;

const DEFAULT_LOBBY_SETTINGS: LobbySettings = {
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

const DEFAULT_STAFF_SETTINGS: StaffBoardSettings = {
  refresh_interval_ms: 2000,
  team_reminder: "Remember: greet every pup by name and confirm checkout prompts.",
  important_notice: "Front desk stays synced with Gingr — no manual board edits needed.",
  show_team_reminders: true,
  footer_message: null,
  published_version: "v1.0.0",
  published_at: null,
  published_by: null
};

function parseBoardType(value: string | null): AdminBoardType {
  if (value === "staff") return "staff";
  if (value === "marketing") return "marketing";
  return "lobby";
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  try {
    const url = new URL(request.url);
    const board = parseBoardType(url.searchParams.get("board"));
    const session = getAdminSessionFromRequest(request);
    const siteUrl = publicOrigin(request);
    const webhookUrl = `${siteUrl}/api/gingr/webhook`;

    // Demo sandbox must not wait on live board tables — those queries were hanging
    // login landings when Supabase stalled.
    if (isDemoSession(session)) {
      const supabase = getServiceSupabase();
      const [lobbySettings, staffSettings, adminSettings, sandbox] = await Promise.all([
        withTimeoutFallback(loadLobbySettings(supabase), DEMO_DASHBOARD_TIMEOUT_MS, DEFAULT_LOBBY_SETTINGS),
        withTimeoutFallback(loadStaffBoardSettings(supabase), DEMO_DASHBOARD_TIMEOUT_MS, DEFAULT_STAFF_SETTINGS),
        withTimeoutFallback(loadAdminSettings(supabase), DEMO_DASHBOARD_TIMEOUT_MS, DEFAULT_ADMIN_SETTINGS),
        withTimeoutFallback(getDemoSandbox(supabase), DEMO_DASHBOARD_TIMEOUT_MS, buildInitialDemoSandbox())
      ]);
      const demoBoard = demoSandboxToBoard(sandbox);
      return NextResponse.json({
        board,
        username: session?.email ?? DEMO_EMAIL,
        fullName: null,
        session: session ? { ...session, access: null } : null,
        admin_settings: adminSettings,
        lobby_settings: lobbySettings,
        staff_settings: staffSettings,
        promotions: [],
        active_checkouts: demoBoard.checking_out.length,
        lobby_checkouts_count: 0,
        sync_status: "healthy",
        last_synced_at: sandbox.last_updated,
        data_source: "Demo Sandbox (isolated)",
        webhook_url: webhookUrl,
        events: [],
        failed_events: [],
        staff_dogs: demoBoard.checking_in,
        demo_stats: sandbox.stats,
        env: getBoardEnvCheck()
      });
    }

    const supabase = getServiceSupabase();

    const [lobbySettings, staffSettings, adminSettings, promotions, checkouts, dogs, events, failedEvents] =
      await Promise.all([
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
        supabase.from("gingr_webhook_events").select("*").order("created_at", { ascending: false }).limit(50),
        supabase
          .from("gingr_webhook_events")
          .select("*")
          .eq("processed", false)
          .order("created_at", { ascending: false })
          .limit(20)
      ]);

    await migrateLegacyUserAccess(supabase).catch(() => undefined);
    const access = session?.adminUserId
      ? await getUserAccess(supabase, session.adminUserId, session.role, session.email)
      : null;
    const profileUser = session?.adminUserId
      ? await getAdminUserById(supabase, session.adminUserId).catch(() => null)
      : null;
    const fullName = profileUser?.full_name?.trim() || null;

    return NextResponse.json({
      board,
      username: session?.email ?? "admin",
      fullName,
      session: session ? { ...session, access } : null,
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
  } catch (error) {
    console.error("[admin-dashboard] GET failed:", error);
    return NextResponse.json(
      { error: "Unable to load admin dashboard. Reload and try again." },
      { status: 500 }
    );
  }
}

async function loadAllPromotions(supabase: ReturnType<typeof getServiceSupabase>) {
  const { data, error } = await supabase.from("lobby_promotions").select("*").order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
