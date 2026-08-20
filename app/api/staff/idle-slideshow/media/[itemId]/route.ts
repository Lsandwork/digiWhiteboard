import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { createPhotoSignedUrl, downloadPhotoBuffer } from "@/lib/photo-upload-queue/storage";
import { staffIdleSlideshowStoragePath } from "@/lib/staff/idle-slideshow";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ itemId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { itemId } = await context.params;
    if (!UUID_RE.test(itemId)) {
      return NextResponse.json({ error: "Photo not found." }, { status: 404 });
    }

    const supabase = getServiceSupabase();
    const { data: item, error } = await supabase
      .from("photo_upload_items")
      .select(
        "id, original_filename, original_storage_path, thumbnail_storage_path, gingr_ready_storage_path, mime_type, media_kind, status"
      )
      .eq("id", itemId)
      .maybeSingle();
    if (error) throw new Error(error.message || "Unable to load photo.");
    if (!item || item.status === "failed" || item.status === "excluded") {
      return NextResponse.json({ error: "Photo not found." }, { status: 404 });
    }
    if (item.media_kind === "video" || String(item.mime_type || "").toLowerCase().startsWith("video/")) {
      return NextResponse.json({ error: "Photo not found." }, { status: 404 });
    }

    const path = staffIdleSlideshowStoragePath(item);
    if (!path) {
      return NextResponse.json({ error: "Photo file is missing." }, { status: 404 });
    }

    const signedUrl = await createPhotoSignedUrl(supabase, path, 60 * 60);
    if (signedUrl) {
      return NextResponse.redirect(signedUrl, 307);
    }

    const buffer = await downloadPhotoBuffer(supabase, path);
    const mime = String(item.mime_type || "").toLowerCase();
    const contentType = mime.startsWith("image/") && mime !== "image/heic" && mime !== "image/heif"
      ? mime
      : "image/jpeg";
    const fileName = String(item.original_filename || "photo.jpg").replace(/[^\w.\-()+ ]+/g, "_");

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(buffer.length),
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load photo.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
