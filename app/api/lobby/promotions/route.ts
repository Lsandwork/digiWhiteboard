import { NextResponse } from "next/server";
import { isLobbyAdmin, isLobbyDisplayAuthorized, unauthorizedLobbyResponse } from "@/lib/lobby/auth";
import { loadLobbyPromotions } from "@/lib/lobby/settings";
import { bumpDisplayContentRevision } from "@/lib/display-sync-server";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isLobbyDisplayAuthorized(request) && !isLobbyAdmin(request)) return unauthorizedLobbyResponse();

  try {
    const promotions = await loadLobbyPromotions(getServiceSupabase());
    return NextResponse.json({ promotions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load lobby promotions.";
    return NextResponse.json({ promotions: [], error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isLobbyAdmin(request)) return unauthorizedLobbyResponse();

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const { data, error } = await getServiceSupabase()
      .from("lobby_promotions")
      .insert({
        title: String(body.title ?? "").trim(),
        subtitle: body.subtitle ? String(body.subtitle) : null,
        category: body.category ? String(body.category) : null,
        icon_key: body.icon_key ? String(body.icon_key) : null,
        image_url: body.image_url ? String(body.image_url) : null,
        starts_at: body.starts_at ? String(body.starts_at) : null,
        ends_at: body.ends_at ? String(body.ends_at) : null,
        active: body.active !== false,
        sort_order: Number(body.sort_order ?? 0)
      })
      .select("*")
      .single();

    if (error) throw error;
    await bumpDisplayContentRevision(getServiceSupabase());
    return NextResponse.json({ promotion: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create promotion.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
