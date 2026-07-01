import { NextResponse } from "next/server";
import { isLobbyAdmin, unauthorizedLobbyResponse } from "@/lib/lobby/auth";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isLobbyAdmin(request)) return unauthorizedLobbyResponse();

  const { id } = await context.params;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if ("title" in body) patch.title = String(body.title ?? "");
    if ("description" in body) patch.description = body.description == null ? null : String(body.description);
    if ("event_at" in body) patch.event_at = body.event_at == null ? null : String(body.event_at);
    if ("active" in body) patch.active = Boolean(body.active);
    if ("sort_order" in body) patch.sort_order = Number(body.sort_order ?? 0);

    const { data, error } = await getServiceSupabase()
      .from("lobby_events")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;
    return NextResponse.json({ event: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update event.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
