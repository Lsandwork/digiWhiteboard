import { NextResponse } from "next/server";
import { buildCastTvPlaylist, loadCastTvMedia } from "@/lib/cast-tv/media";
import { resolveCastTvManager } from "@/lib/cast-tv/api-auth";
import { castTvErrorMessage } from "@/lib/cast-tv/errors";
import { getCastTvSupabase } from "@/lib/cast-tv/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const supabase = getCastTvSupabase();
  try {
    const playlist = await buildCastTvPlaylist(supabase);
    const manager = await resolveCastTvManager(request);
    if (!manager) {
      return NextResponse.json({ playlist });
    }

    try {
      const media = await loadCastTvMedia(manager.supabase);
      return NextResponse.json({
        media,
        playlist: playlist.length ? playlist : buildPlaylistFromMedia(media),
        admin: true
      });
    } catch {
      return NextResponse.json({
        media: [],
        playlist,
        admin: true
      });
    }
  } catch (error) {
    return NextResponse.json(
      { error: castTvErrorMessage(error, "Unable to load CAST-TV media."), playlist: [] },
      { status: 500 }
    );
  }
}

function buildPlaylistFromMedia(media: Awaited<ReturnType<typeof loadCastTvMedia>>) {
  return media
    .filter((record) => record.is_enabled && record.public_url)
    .map((record) => ({
      id: record.id,
      displayName: record.display_name || record.file_name,
      mediaType: record.media_type,
      src: record.public_url as string,
      imageDisplaySeconds: record.image_display_seconds,
      durationSeconds: record.duration_seconds,
      updatedAt: record.updated_at
    }));
}
