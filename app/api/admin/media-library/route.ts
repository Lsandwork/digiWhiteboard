import { NextResponse } from "next/server";
import {
  demoWriteGuard,
  isPhotoUploadAuthOk,
  requirePhotoUploadAccess
} from "@/lib/photo-upload-queue/api-guard";
import { listMediaLibrary } from "@/lib/media-library/service";
import type { MediaDatePreset, MediaTypeFilter } from "@/lib/media-library/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requirePhotoUploadAccess(request);
  if (!isPhotoUploadAuthOk(auth)) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const datePreset = (searchParams.get("date_preset") || "all") as MediaDatePreset;
    const mediaType = (searchParams.get("media_type") || "all") as MediaTypeFilter;

    const result = await listMediaLibrary(
      auth.supabase,
      {
        page: Number(searchParams.get("page") || 1),
        pageSize: Number(searchParams.get("page_size") || 48),
        q: searchParams.get("q") || undefined,
        mediaType,
        datePreset,
        dateFrom: searchParams.get("date_from") || undefined,
        dateTo: searchParams.get("date_to") || undefined
      },
      { access: auth.access, role: auth.session?.role }
    );

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load media library.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const blocked = demoWriteGuard(request);
  if (blocked) return blocked;

  const auth = await requirePhotoUploadAccess(request);
  if (!isPhotoUploadAuthOk(auth)) return auth.error;

  return NextResponse.json(
    { error: "Use batch upload or direct video upload endpoints for new media." },
    { status: 405 }
  );
}
