import { NextResponse } from "next/server";
import type { AdminBoardType } from "@/lib/admin/types";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { getUserAccess, migrateLegacyUserAccess } from "@/lib/admin/user-access";
import { getAdminUserById } from "@/lib/admin/users";
import { loadFastPromptedCheckouts } from "@/lib/board-fast-checkout";
import { getBoardEnvCheck } from "@/lib/env";
import { publicOrigin } from "@/lib/gingr";
import { loadAdminSettings } from "@/lib/admin/settings";
import { loadLobbySettings } from "@/lib/lobby/settings";
import { loadStaffBoardSettings } from "@/lib/staff/settings";
import { getServiceSupabase } from "@/lib/supabase/server";
import { DEMO_EMAIL } from "@/lib/demo/constants";
import { isDemoSession } from "@/lib/demo/session";
import { demoSandboxToBoard, getDemoSandbox } from "@/lib/demo/store";

export const dynamic = "force-dynamic";

function parseBoardType(value: string | null): AdminBoardType {
  if (value === "staff") return "staff";
  if (value === "marketing") return "marketing";
  return "lobby";
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

  const session = getAdminSessionFromRequest(request);
  await migrateLegacyUserAccess(supabase).catch(() => undefined);
  const access = session?.adminUserId
    ? await getUserAccess(supabase, session.adminUserId, session.role, session.email)
    : null;
  const profileUser = session?.adminUserId
    ? await getAdminUserById(supabase, session.adminUserId).catch(() => null)
    : null;
  const fullName = profileUser?.full_name?.trim() || null;

  if (isDemoSession(session)) {
    const sandbox = await getDemoSandbox(supabase);
    const demoBoard = demoSandboxToBoard(sandbox);
    return NextResponse.json({
      board,
      username: session?.email ?? DEMO_EMAIL,
      fullName,
      session: session ? { ...session, access } : null,
      admin_settings: adminSettings,
      lobby_settings: lobbySettings,
      staff_settings: staffSettings,
      promotions: promotions ?? [],
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
}

async function loadAllPromotions(supabase: ReturnType<typeof getServiceSupabase>) {
  const { data, error } = await supabase.from("lobby_promotions").select("*").order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
