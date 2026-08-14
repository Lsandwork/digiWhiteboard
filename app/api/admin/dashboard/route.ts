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

/**
 * Board widgets must never lock staff out of the admin. A single slow Supabase
 * read (the checkout query hard-times-out at 1.5s) used to reject the whole
 * Promise.all and 500 the dashboard, which reads as "login is broken".
 */
async function optional<T>(work: Promise<T>, fallback: T, label: string): Promise<T> {
  try {
    return await work;
  } catch (error) {
    console.error(`[admin-dashboard] ${label} unavailable:`, error);
    return fallback;
  }
}

/** Same guard for raw Supabase reads, flattened to plain rows. */
async function optionalRows<T>(work: PromiseLike<{ data: T[] | null }>, label: string): Promise<T[]> {
  try {
    return (await work).data ?? [];
  } catch (error) {
    console.error(`[admin-dashboard] ${label} unavailable:`, error);
    return [];
  }
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const session = getAdminSessionFromRequest(request);
  if (session?.mustChangePassword) {
    return NextResponse.json({ error: "Password change required." }, { status: 403 });
  }

  try {
    const url = new URL(request.url);
    const board = parseBoardType(url.searchParams.get("board"));
    const supabase = getServiceSupabase();

  const [lobbySettings, staffSettings, adminSettings, promotions, checkouts, dogs, events, failedEvents] = await Promise.all([
    loadLobbySettings(supabase),
    loadStaffBoardSettings(supabase),
    loadAdminSettings(supabase),
    optional(loadAllPromotions(supabase), [], "promotions"),
    optional(loadFastPromptedCheckouts(supabase), null, "fast checkouts"),
    optionalRows(
      supabase
        .from("live_transition_dogs")
        .select("*")
        .eq("hidden", false)
        .in("display_status", ["checking_in", "checking_out"])
        .order("updated_at", { ascending: false }),
      "transition dogs"
    ),
    optionalRows(
      supabase
        .from("gingr_webhook_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),
      "webhook events"
    ),
    optionalRows(
      supabase
        .from("gingr_webhook_events")
        .select("*")
        .eq("processed", false)
        .order("created_at", { ascending: false })
        .limit(20),
      "failed webhook events"
    )
  ]);

  const siteUrl = publicOrigin(request);
  const webhookUrl = `${siteUrl}/api/gingr/webhook`;

  await migrateLegacyUserAccess(supabase).catch(() => undefined);
  const access = session?.adminUserId
    ? await getUserAccess(supabase, session.adminUserId, session.role, session.email).catch(() => null)
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
    active_checkouts: checkouts?.checking_out.length ?? 0,
    lobby_checkouts_count: checkouts?.checking_out.length ?? 0,
    sync_status: checkouts ? "healthy" : "degraded",
    last_synced_at: checkouts?.newest_checkout_at ?? null,
    data_source: "Supabase (Cached)",
    webhook_url: webhookUrl,
    events,
    failed_events: failedEvents,
    staff_dogs: dogs,
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
