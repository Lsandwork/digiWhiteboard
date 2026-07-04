import { NextResponse } from "next/server";
import type { AdminBoardType } from "@/lib/admin/types";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { updateLobbySettings } from "@/lib/lobby/settings";
import { updateStaffBoardSettings } from "@/lib/staff/settings";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function nextVersion(current: string) {
  const match = current.match(/^v(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return "v1.0.1";
  const patch = Number(match[3]) + 1;
  return `v${match[1]}.${match[2]}.${patch}`;
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const body = (await request.json()) as { board?: AdminBoardType };
  const board: AdminBoardType = body.board === "staff" ? "staff" : "lobby";
  const username = getAdminSessionFromRequest(request) ?? "admin";
  const supabase = getServiceSupabase();
  const now = new Date().toISOString();

  if (board === "staff") {
    const { data: current } = await supabase.from("staff_board_settings").select("published_version").eq("id", "default").maybeSingle();
    const version = nextVersion(String(current?.published_version ?? "v1.0.0"));
    await updateStaffBoardSettings(supabase, {
      published_version: version,
      published_at: now,
      published_by: username
    });
    await supabase.from("admin_publish_log").insert({ board_type: "staff", version, published_by: username });
    return NextResponse.json({ board, version, published_at: now, published_by: username });
  }

  const { data: current } = await supabase.from("lobby_settings").select("published_version").eq("id", "default").maybeSingle();
  const version = nextVersion(String(current?.published_version ?? "v1.0.0"));
  await updateLobbySettings(supabase, {
    published_version: version,
    published_at: now,
    published_by: username
  });
  await supabase.from("admin_publish_log").insert({ board_type: "lobby", version, published_by: username });
  return NextResponse.json({ board, version, published_at: now, published_by: username });
}
