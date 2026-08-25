import { NextResponse } from "next/server";
import {
  CAST_TV_ADMIN_PAGE_SIZE,
  mediaRevisionFromLibrary,
  paginateCastTvAdminMedia,
  type CastTvAdminListStatus
} from "@/lib/cast-tv/admin-list";
import { resolveCastTvManager } from "@/lib/cast-tv/api-auth";
import { castTvErrorMessage } from "@/lib/cast-tv/errors";
import { CAST_TV_STORAGE_BUCKET, loadCastTvLibrary, publicUrlForCastTvStorage } from "@/lib/cast-tv/library-store";
import { mediaRecordToPlaylistItem, withCacheBustedSrc } from "@/lib/cast-tv/media";
import { logCastTvQuery } from "@/lib/cast-tv/query-log";
import { probeAndMarkMissingCastTvMedia } from "@/lib/cast-tv/stored-image";
import { getCastTvSupabase } from "@/lib/cast-tv/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function parseAdminStatus(value: string | null): CastTvAdminListStatus {
  return value === "disabled" ? "disabled" : "active";
}

function parsePageInt(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

export async function GET(request: Request) {
  const supabase = getCastTvSupabase();
  const started = Date.now();
  try {
    const url = new URL(request.url);
    const manager = await resolveCastTvManager(request);
    const playlistOnly = url.searchParams.get("playlist") === "1" || !manager;
    const library = await loadCastTvLibrary(supabase, {
      trigger: playlistOnly ? "playlist" : Number(url.searchParams.get("offset") || 0) > 0 ? "pagination" : "initial-load"
    });
    const records = library.media.map((record) => ({
      ...record,
      public_url:
        record.public_url ||
        publicUrlForCastTvStorage(
          supabase,
          record.storage_path,
          record.updated_at,
          record.bucket || CAST_TV_STORAGE_BUCKET
        )
    }));

    if (playlistOnly) {
      const playlist = records
        .filter((record) => record.is_enabled && !record.storage_missing && (record.public_url || record.storage_path))
        .map((record) => withCacheBustedSrc(mediaRecordToPlaylistItem(record)));
      logCastTvQuery({
        name: "api.cast-tv.media.playlist",
        rows: playlist.length,
        durationMs: Date.now() - started,
        cache: "miss",
        trigger: "playlist"
      });
      return NextResponse.json(
        { playlist },
        {
          headers: {
            "Cache-Control": "private, max-age=10, stale-while-revalidate=20"
          }
        }
      );
    }

    const status = parseAdminStatus(url.searchParams.get("status"));
    const limit = parsePageInt(url.searchParams.get("limit"), CAST_TV_ADMIN_PAGE_SIZE, 1, 50);
    const offset = parsePageInt(url.searchParams.get("offset"), 0, 0, 10_000);
    const probe = url.searchParams.get("probe") === "1";
    const trigger = offset > 0 ? "pagination" : "initial-load";

    let nextRecords = records;
    if (probe) {
      const pageIds = new Set(
        paginateCastTvAdminMedia(records, { status, offset, limit }).items.map((item) => item.id)
      );
      const probed = await probeAndMarkMissingCastTvMedia(
        supabase,
        records.filter((item) => pageIds.has(item.id))
      );
      const byId = new Map(records.map((item) => [item.id, item]));
      for (const item of probed) byId.set(item.id, item);
      nextRecords = [...byId.values()];
    }

    const paged = paginateCastTvAdminMedia(nextRecords, { status, offset, limit });
    logCastTvQuery({
      name: `api.cast-tv.media.admin.${status}`,
      rows: paged.items.length,
      durationMs: Date.now() - started,
      cache: "miss",
      trigger
    });

    return NextResponse.json({
      items: paged.items,
      page: paged.page,
      counts: paged.counts,
      mediaRevision: mediaRevisionFromLibrary(nextRecords, library.settings.updated_at),
      admin: true
    });
  } catch (error) {
    return NextResponse.json(
      { error: castTvErrorMessage(error, "Unable to load CAST-TV media."), playlist: [], items: [] },
      { status: 500 }
    );
  }
}
