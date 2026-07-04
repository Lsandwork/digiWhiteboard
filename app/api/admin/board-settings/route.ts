import { NextResponse } from "next/server";
import type { AdminBoardType } from "@/lib/admin/types";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { LOBBY_CLASS_SCHEDULE } from "@/lib/lobby/class-schedule";
import { loadLobbySettings, updateLobbySettings } from "@/lib/lobby/settings";
import { loadStaffBoardSettings, updateStaffBoardSettings } from "@/lib/staff/settings";
import { bumpDisplayContentRevision } from "@/lib/display-sync-server";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function parseBoard(value: string | null): AdminBoardType {
  return value === "staff" ? "staff" : "lobby";
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const board = parseBoard(new URL(request.url).searchParams.get("board"));
  const supabase = getServiceSupabase();

  if (board === "staff") {
    const settings = await loadStaffBoardSettings(supabase);
    return NextResponse.json({ board, settings });
  }

  const settings = await loadLobbySettings(supabase);
  return NextResponse.json({ board, settings });
}

export async function PATCH(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const url = new URL(request.url);
  const board = parseBoard(url.searchParams.get("board"));
  const body = (await request.json()) as Record<string, unknown>;
  const supabase = getServiceSupabase();

  if (board === "staff") {
    const settings = await updateStaffBoardSettings(supabase, {
      refresh_interval_ms: body.refresh_interval_ms != null ? Number(body.refresh_interval_ms) : undefined,
      team_reminder: body.team_reminder != null ? String(body.team_reminder) : undefined,
      important_notice: body.important_notice != null ? String(body.important_notice) : undefined,
      show_team_reminders: body.show_team_reminders != null ? Boolean(body.show_team_reminders) : undefined,
      footer_message: body.footer_message != null ? String(body.footer_message) : undefined
    });
    await bumpDisplayContentRevision(supabase);
    return NextResponse.json({ board, settings });
  }

  const settings = await updateLobbySettings(supabase, {
    max_queue_count: body.max_queue_count != null ? Number(body.max_queue_count) : undefined,
    refresh_interval_ms: body.refresh_interval_ms != null ? Number(body.refresh_interval_ms) : undefined,
    show_promotions: body.show_promotions != null ? Boolean(body.show_promotions) : undefined,
    show_events: body.show_class_schedule != null ? Boolean(body.show_class_schedule) : body.show_events != null ? Boolean(body.show_events) : undefined,
    footer_message: body.footer_message != null ? String(body.footer_message) : undefined,
    lobby_message: body.lobby_message != null ? String(body.lobby_message) : undefined,
    class_schedule: Array.isArray(body.class_schedule) ? body.class_schedule : undefined
  });

  await bumpDisplayContentRevision(supabase);
  return NextResponse.json({ board, settings });
}

export async function DELETE(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const board = parseBoard(new URL(request.url).searchParams.get("board"));
  const supabase = getServiceSupabase();

  if (board === "staff") {
    const settings = await updateStaffBoardSettings(supabase, {
      refresh_interval_ms: 2000,
      team_reminder: "Remember: greet every pup by name and confirm checkout prompts.",
      important_notice: "Front desk stays synced with Gingr — no manual board edits needed.",
      show_team_reminders: true,
      footer_message: null
    });
    await bumpDisplayContentRevision(supabase);
    return NextResponse.json({ board, settings });
  }

  const settings = await updateLobbySettings(supabase, {
    max_queue_count: 6,
    refresh_interval_ms: 3000,
    show_promotions: true,
    show_events: true,
    footer_message: "Thanks for being part of the Fitdog family. We'll take care of the rest.",
    lobby_message: "Thank you for letting us play, care & connect!",
    class_schedule: LOBBY_CLASS_SCHEDULE
  });

  await bumpDisplayContentRevision(supabase);
  return NextResponse.json({ board, settings });
}
