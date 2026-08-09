import { NextResponse } from "next/server";
import {
  isPhotoUploadAuthOk,
  requirePhotoUploadAccess
} from "@/lib/photo-upload-queue/api-guard";
import { getMediaLibraryItem } from "@/lib/media-library/service";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ itemId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const auth = await requirePhotoUploadAccess(request);
  if (!isPhotoUploadAuthOk(auth)) return auth.error;

  try {
    const { itemId } = await context.params;
    const item = await getMediaLibraryItem(auth.supabase, itemId, {
      access: auth.access,
      role: auth.session?.role
    });
    if (!item) {
      return NextResponse.json({ error: "Media not found." }, { status: 404 });
    }
    return NextResponse.json({ item });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load media item.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
