import { NextResponse } from "next/server";
import { loadCastTvMedia, mediaRecordToPlaylistItem, withCacheBustedSrc } from "@/lib/cast-tv/media";
import { resolveCastTvManager } from "@/lib/cast-tv/api-auth";
import { castTvErrorMessage } from "@/lib/cast-tv/errors";
import { getCastTvSupabase } from "@/lib/cast-tv/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const supabase = getCastTvSupabase();
  try {
    const media = await loadCastTvMedia(supabase);
    const playlist = media
      .filter((record) => record.is_enabled && record.public_url)
      .map((record) => withCacheBustedSrc(mediaRecordToPlaylistItem(record)));

    const manager = await resolveCastTvManager(request);
    if (!manager) {
      return NextResponse.json({ playlist });
    }

    return NextResponse.json({
      media,
      playlist,
      admin: true
    });
  } catch (error) {
    return NextResponse.json(
      { error: castTvErrorMessage(error, "Unable to load CAST-TV media."), playlist: [] },
      { status: 500 }
    );
  }
}
