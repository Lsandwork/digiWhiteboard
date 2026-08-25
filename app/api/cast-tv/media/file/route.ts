import { NextResponse } from "next/server";
import { CAST_TV_THUMB_MAX_EDGE, isLocalCastTvAsset, transcodeCastTvDisplayImage } from "@/lib/cast-tv/display-image";
import { isTransientCastTvStorageError } from "@/lib/cast-tv/errors";
import { loadCastTvLibrary } from "@/lib/cast-tv/library-store";
import { logCastTvQuery } from "@/lib/cast-tv/query-log";
import {
  downloadCastTvStorageFile,
  isMissingCastTvFileError,
  markMissingCastTvStorage
} from "@/lib/cast-tv/stored-image";
import { getCastTvSupabase } from "@/lib/cast-tv/supabase";
import { castTvStorageThumbUrl } from "@/lib/cast-tv/thumbs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function missingResponse() {
  return NextResponse.json(
    { error: "CAST-TV photo is missing from storage.", storage_missing: true },
    { status: 404 }
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.trim() || "";
  const kind = url.searchParams.get("kind") === "thumb" ? "thumb" : "display";
  const fallback = url.searchParams.get("fallback") === "1";
  if (!id) {
    return NextResponse.json({ error: "Missing CAST-TV media id." }, { status: 400 });
  }

  const started = Date.now();
  try {
    const supabase = getCastTvSupabase();
    const library = await loadCastTvLibrary(supabase, { recoverOrphans: false, trigger: "thumbnail" });
    const record =
      library.media.find((item) => item.id === id) ||
      library.media.find((item) => item.id === decodeURIComponent(id));

    if (!record || record.media_type !== "image") {
      return NextResponse.json({ error: "CAST-TV photo not found." }, { status: 404 });
    }

    if (record.storage_missing) {
      return missingResponse();
    }

    if (isLocalCastTvAsset(record) && record.public_url?.startsWith("/assets/")) {
      return NextResponse.redirect(new URL(record.public_url, request.url), 302);
    }

    if (kind === "thumb" && !fallback) {
      const thumbUrl = castTvStorageThumbUrl(record);
      if (thumbUrl && /^https?:\/\//i.test(thumbUrl)) {
        logCastTvQuery({
          name: "api.cast-tv.media.file.thumb-redirect",
          rows: 1,
          durationMs: Date.now() - started,
          cache: "bypass",
          trigger: "thumbnail"
        });
        return NextResponse.redirect(thumbUrl, 302);
      }
    }

    const downloaded = await downloadCastTvStorageFile(supabase, record.storage_path, record.bucket);
    const transcoded = await transcodeCastTvDisplayImage(downloaded.bytes, {
      maxEdge: kind === "thumb" ? CAST_TV_THUMB_MAX_EDGE : undefined,
      includeHashes: kind !== "thumb"
    });
    logCastTvQuery({
      name: `api.cast-tv.media.file.${kind}`,
      rows: 1,
      durationMs: Date.now() - started,
      cache: "miss",
      trigger: "thumbnail"
    });
    return new NextResponse(new Uint8Array(transcoded.buffer), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    if (isMissingCastTvFileError(error)) {
      const supabase = getCastTvSupabase();
      void markMissingCastTvStorage(supabase, [id]).catch(() => undefined);
      return missingResponse();
    }
    const status = isTransientCastTvStorageError(error) ? 503 : 404;
    return NextResponse.json({ error: "Unable to display this CAST-TV photo." }, { status });
  }
}
