import { NextResponse } from "next/server";
import { canDownloadPhotoUploads } from "@/lib/photo-upload-queue/access";
import {
  isPhotoUploadAuthOk,
  requirePhotoUploadAccess
} from "@/lib/photo-upload-queue/api-guard";
import { downloadPhotoBuffer } from "@/lib/photo-upload-queue/storage";
import { PHOTO_UPLOAD_BUCKET } from "@/lib/photo-upload-queue/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ itemId: string }> };

/**
 * Same-origin media proxy so gallery thumbnails/downloads work in Safari
 * (cross-origin Supabase signed URLs often fail to render as <img> src).
 */
export async function GET(request: Request, context: RouteContext) {
  const auth = await requirePhotoUploadAccess(request);
  if (!isPhotoUploadAuthOk(auth)) return auth.error;

  try {
    const { itemId } = await context.params;
    const { searchParams } = new URL(request.url);
    const variant = searchParams.get("variant") === "original" ? "original" : "thumbnail";

    if (variant === "original" && !canDownloadPhotoUploads(auth.access, auth.session?.role)) {
      return NextResponse.json(
        { error: "You can view photos, but downloads require elevated access." },
        { status: 403 }
      );
    }

    const { data: item, error } = await auth.supabase
      .from("photo_upload_items")
      .select("id, original_filename, original_storage_path, thumbnail_storage_path, gingr_ready_storage_path, mime_type")
      .eq("id", itemId)
      .maybeSingle();
    if (error) throw new Error(error.message || "Unable to load photo.");
    if (!item) {
      return NextResponse.json({ error: "Photo not found." }, { status: 404 });
    }

    const path =
      variant === "original"
        ? item.original_storage_path || item.gingr_ready_storage_path || item.thumbnail_storage_path
        : item.thumbnail_storage_path || item.gingr_ready_storage_path || item.original_storage_path;

    if (!path) {
      return NextResponse.json({ error: "Photo file is missing." }, { status: 404 });
    }

    const buffer = await downloadPhotoBuffer(auth.supabase, path);
    const contentType =
      variant === "thumbnail"
        ? "image/jpeg"
        : item.mime_type || "image/jpeg";
    const fileName = String(item.original_filename || "photo.jpg").replace(/[^\w.\-()+ ]+/g, "_");
    const disposition =
      searchParams.get("download") === "1"
        ? `attachment; filename="${fileName}"`
        : `inline; filename="${fileName}"`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(buffer.length),
        "Content-Disposition": disposition,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
        "X-Photo-Bucket": PHOTO_UPLOAD_BUCKET
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load photo.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
