import { NextResponse } from "next/server";
import { buildCastTvPlaylist, loadCastTvMedia } from "@/lib/cast-tv/media";
import { resolveCastTvManager } from "@/lib/cast-tv/api-auth";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const manager = await resolveCastTvManager(request);
    if (manager) {
      const media = await loadCastTvMedia(manager.supabase);
      return NextResponse.json({ media, admin: true });
    }

    const playlist = await buildCastTvPlaylist(getServiceSupabase());
    return NextResponse.json({ playlist });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load CAST-TV media.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
