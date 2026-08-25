import { after, NextResponse } from "next/server";
import type { AdminBoardType } from "@/lib/admin/types";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { accessFromLegacyRole } from "@/lib/admin/permissions";
import { getUserAccess, migrateLegacyUserAccess } from "@/lib/admin/user-access";
import { getAdminUserById } from "@/lib/admin/users";
import { loadFastPromptedCheckouts } from "@/lib/board-fast-checkout";
import { cachedLoadSettingsBundle, FAST_CHECKOUT_CACHE_TTL_MS } from "@/lib/board-settings-cache";
import { getBoardEnvCheck } from "@/lib/env";
import { publicOrigin } from "@/lib/gingr";
import { skipHeavyBoardWidgets, skipSettingsAndAccess } from "@/lib/admin/dashboard-load";
import { DEFAULT_ADMIN_SETTINGS } from "@/lib/admin/settings";
import { defaultLobbySettings } from "@/lib/lobby/settings";
import { defaultStaffSettings } from "@/lib/staff/settings";
import { getServiceSupabase } from "@/lib/supabase/server";
import { getOrLoadTtlCache, withTimeoutOrThrow } from "@/lib/server-ttl-cache";
import { DEMO_EMAIL } from "@/lib/demo/constants";
import { isDemoSession } from "@/lib/demo/session";
import { demoSandboxToBoard, getDemoSandbox } from "@/lib/demo/store";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

/** Never block sign-in on a hung Supabase read — the UI shows "Loading admin dashboard…" forever. */
const DASHBOARD_QUERY_TIMEOUT_MS = 5_000;

const DEFAULT_SETTINGS_BUNDLE = {
  admin: DEFAULT_ADMIN_SETTINGS,
  lobby: defaultLobbySettings,
  staff: defaultStaffSettings
};

function parseBoardType(value: string | null): AdminBoardType {
  if (value === "staff") return "staff";
  if (value === "marketing") return "marketing";
  return "lobby";
}

async function timed<T>(label: string, fallback: T, work: Promise<T>): Promise<T> {
  try {
    return await withTimeoutOrThrow(work, DASHBOARD_QUERY_TIMEOUT_MS, label);
  } catch (error) {
    console.error(`[admin-dashboard] ${label} unavailable:`, error);
    return fallback;
  }
}

async function timedRows<T>(
  label: string,
  work: PromiseLike<{ data: T[] | null }>
): Promise<T[]> {
  try {
    const result = await withTimeoutOrThrow(Promise.resolve(work), DASHBOARD_QUERY_TIMEOUT_MS, label);
    return result.data ?? [];
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
    const tab = url.searchParams.get("tab");
    const lightLoad = skipHeavyBoardWidgets(board, tab);
    const skipAccessWork = skipSettingsAndAccess(tab);
    const supabase = getServiceSupabase({ timeoutMs: DASHBOARD_QUERY_TIMEOUT_MS });

    after(() => {
      void migrateLegacyUserAccess(supabase).catch(() => undefined);
    });

    const fallbackAccess = session?.adminUserId
      ? accessFromLegacyRole(session.adminUserId, session.email, session.role)
      : null;

    const emptyWidgets = [[], null, [], [], []] as const;

    const [settingsBundle, widgetResults, access, profileUser] = await Promise.all([
      skipAccessWork
        ? Promise.resolve(DEFAULT_SETTINGS_BUNDLE)
        : timed("settings bundle", DEFAULT_SETTINGS_BUNDLE, cachedLoadSettingsBundle(supabase)),
      lightLoad
        ? Promise.resolve(emptyWidgets)
        : Promise.all([
            timed("promotions", [], loadAllPromotions(supabase)),
            timed(
              "fast checkouts",
              null,
              getOrLoadTtlCache(`board-checkouts:admin`, FAST_CHECKOUT_CACHE_TTL_MS, () =>
                loadFastPromptedCheckouts(supabase)
              )
            ),
            timedRows(
              "transition dogs",
              supabase
                .from("live_transition_dogs")
                .select("*")
                .eq("hidden", false)
                .in("display_status", ["checking_in", "checking_out"])
                .order("updated_at", { ascending: false })
                .limit(120)
            ),
            timedRows(
              "webhook events",
              supabase
                .from("gingr_webhook_events")
                .select("*")
                .order("created_at", { ascending: false })
                .limit(50)
            ),
            timedRows(
              "failed webhook events",
              supabase
                .from("gingr_webhook_events")
                .select("*")
                .eq("processed", false)
                .order("created_at", { ascending: false })
                .limit(20)
            )
          ]),
      skipAccessWork
        ? Promise.resolve(fallbackAccess)
        : session?.adminUserId
          ? timed("user access", fallbackAccess, getUserAccess(supabase, session.adminUserId, session.role, session.email))
          : Promise.resolve(null),
      skipAccessWork
        ? Promise.resolve(null)
        : session?.adminUserId
          ? timed("admin profile", null, getAdminUserById(supabase, session.adminUserId))
          : Promise.resolve(null)
    ]);

    const [promotions, checkouts, dogs, events, failedEvents] = widgetResults;
    const { admin: adminSettings, lobby: lobbySettings, staff: staffSettings } = settingsBundle;

    const siteUrl = publicOrigin(request);
    const webhookUrl = `${siteUrl}/api/gingr/webhook`;
    const fullName = profileUser?.full_name?.trim() || null;

    if (isDemoSession(session)) {
      const sandbox = await timed("demo sandbox", null, getDemoSandbox(supabase));
      if (!sandbox) {
        return NextResponse.json({ error: "Demo sandbox unavailable." }, { status: 503 });
      }
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
