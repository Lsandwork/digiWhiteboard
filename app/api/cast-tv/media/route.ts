import { NextResponse } from "next/server";
import { loadCastTvMedia, mediaRecordToPlaylistItem, withCacheBustedSrc } from "@/lib/cast-tv/media";
import { resolveCastTvManager } from "@/lib/cast-tv/api-auth";
import { castTvErrorMessage } from "@/lib/cast-tv/errors";
import { repairCastTvLibraryImages } from "@/lib/cast-tv/repair-images";
import { getCastTvSupabase } from "@/lib/cast-tv/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const supabase = getCastTvSupabase();
  try {
    const manager = await resolveCastTvManager(request);
    let media = await loadCastTvMedia(supabase);
    if (manager) {
      try {
        media = await repairCastTvLibraryImages(supabase, { budgetMs: 25_000 });
      } catch {
        /* serve the current playlist even if repair has to wait for the next load */
      }
    }
    const playlist = media
      .filter((record) => record.is_enabled && (record.public_url || record.storage_path))
      .map((record) => withCacheBustedSrc(mediaRecordToPlaylistItem(record)));
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
