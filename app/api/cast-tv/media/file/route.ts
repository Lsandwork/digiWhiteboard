import { NextResponse } from "next/server";
import { isLocalCastTvAsset, transcodeCastTvDisplayImage } from "@/lib/cast-tv/display-image";
import { loadCastTvLibrary } from "@/lib/cast-tv/library-store";
import { downloadCastTvStorageFile } from "@/lib/cast-tv/stored-image";
import { getCastTvSupabase } from "@/lib/cast-tv/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id")?.trim() || "";
  if (!id) {
    return NextResponse.json({ error: "Missing CAST-TV media id." }, { status: 400 });
  }

  try {
    const supabase = getCastTvSupabase();
    let library = await loadCastTvLibrary(supabase, { recoverOrphans: false });
    let record =
      library.media.find((item) => item.id === id) ||
      library.media.find((item) => item.id === decodeURIComponent(id));
    if (!record) {
      library = await loadCastTvLibrary(supabase);
      record =
        library.media.find((item) => item.id === id) ||
        library.media.find((item) => item.id === decodeURIComponent(id));
    }

    if (!record || record.media_type !== "image") {
      return NextResponse.json({ error: "CAST-TV photo not found." }, { status: 404 });
    }

    if (isLocalCastTvAsset(record) && record.public_url?.startsWith("/assets/")) {
      return NextResponse.redirect(new URL(record.public_url, request.url), 302);
    }

    const downloaded = await downloadCastTvStorageFile(supabase, record.storage_path, record.bucket);
    const transcoded = await transcodeCastTvDisplayImage(downloaded.bytes);
    return new NextResponse(new Uint8Array(transcoded.buffer), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch {
    return NextResponse.json({ error: "Unable to display this CAST-TV photo." }, { status: 404 });
  }
}
