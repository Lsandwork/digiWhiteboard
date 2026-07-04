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

    for (const key of ["title", "subtitle", "category", "icon_key", "image_url", "starts_at", "ends_at"] as const) {
      if (key in body) patch[key] = body[key] == null ? null : String(body[key]);
    }
    if ("active" in body) patch.active = Boolean(body.active);
    if ("sort_order" in body) patch.sort_order = Number(body.sort_order ?? 0);

    const { data, error } = await getServiceSupabase()
      .from("lobby_promotions")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;
    return NextResponse.json({ promotion: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update promotion.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isLobbyAdmin(request)) return unauthorizedLobbyResponse();

  const { id } = await context.params;

  try {
    const { error } = await getServiceSupabase().from("lobby_promotions").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete promotion.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
