import { NextResponse } from "next/server";
import { isLobbyAdmin, isLobbyDisplayAuthorized, unauthorizedLobbyResponse } from "@/lib/lobby/auth";
import { loadLobbyEvents } from "@/lib/lobby/settings";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isLobbyDisplayAuthorized(request) && !isLobbyAdmin(request)) return unauthorizedLobbyResponse();

  try {
    const events = await loadLobbyEvents(getServiceSupabase());
    return NextResponse.json({ events });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load lobby events.";
    return NextResponse.json({ events: [], error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isLobbyAdmin(request)) return unauthorizedLobbyResponse();

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const { data, error } = await getServiceSupabase()
      .from("lobby_events")
      .insert({
        title: String(body.title ?? "").trim(),
        description: body.description ? String(body.description) : null,
        event_at: body.event_at ? String(body.event_at) : null,
        active: body.active !== false,
        sort_order: Number(body.sort_order ?? 0)
      })
      .select("*")
      .single();

    if (error) throw error;
    return NextResponse.json({ event: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create event.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
