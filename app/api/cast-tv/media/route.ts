import { NextResponse } from "next/server";
import { buildCastTvPlaylist, loadCastTvMedia } from "@/lib/cast-tv/media";
import { resolveCastTvManager } from "@/lib/cast-tv/api-auth";
import { castTvErrorMessage } from "@/lib/cast-tv/errors";
import { getCastTvSupabase } from "@/lib/cast-tv/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const manager = await resolveCastTvManager(request);
    if (manager) {
      const media = await loadCastTvMedia(manager.supabase);
      return NextResponse.json({ media, admin: true });
    }

    const playlist = await buildCastTvPlaylist(getCastTvSupabase());
    return NextResponse.json({ playlist });
  } catch (error) {
    return NextResponse.json(
      { error: castTvErrorMessage(error, "Unable to load CAST-TV media.") },
      { status: 500 }
    );
  }
}
