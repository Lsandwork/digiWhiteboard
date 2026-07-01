import { NextResponse } from "next/server";
import { isLobbyAdmin, isLobbyDisplayAuthorized, unauthorizedLobbyResponse } from "@/lib/lobby/auth";
import { loadLobbySettings, updateLobbySettings } from "@/lib/lobby/settings";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isLobbyDisplayAuthorized(request) && !isLobbyAdmin(request)) return unauthorizedLobbyResponse();

  try {
    const settings = await loadLobbySettings(getServiceSupabase());
    return NextResponse.json({ settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load lobby settings.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!isLobbyAdmin(request)) return unauthorizedLobbyResponse();

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};

    if ("max_queue_count" in body) patch.max_queue_count = Number(body.max_queue_count);
    if ("refresh_interval_ms" in body) patch.refresh_interval_ms = Number(body.refresh_interval_ms);
    if ("show_promotions" in body) patch.show_promotions = Boolean(body.show_promotions);
    if ("show_events" in body) patch.show_events = Boolean(body.show_events);
    if ("footer_message" in body) patch.footer_message = body.footer_message == null ? null : String(body.footer_message);
    if ("lobby_message" in body) patch.lobby_message = body.lobby_message == null ? null : String(body.lobby_message);

    const settings = await updateLobbySettings(getServiceSupabase(), patch);
    return NextResponse.json({ settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update lobby settings.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
