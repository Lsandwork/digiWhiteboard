import { NextResponse } from "next/server";
import { canDownloadPhotoUploads } from "@/lib/photo-upload-queue/access";
import {
  getOrCreateTodayLibraryBatch,
  listBatches,
  listCategories,
  listYards
} from "@/lib/photo-upload-queue/service";
import {
  demoWriteGuard,
  isPhotoUploadAuthOk,
  requirePhotoUploadAccess
} from "@/lib/photo-upload-queue/api-guard";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requirePhotoUploadAccess(request);
  if (!isPhotoUploadAuthOk(auth)) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const ensureToday = searchParams.get("ensure_today") === "1";
    const canDownload = canDownloadPhotoUploads(auth.access, auth.session?.role);

    const [listed, categories, yards, todayBatch] = await Promise.all([
      listBatches(auth.supabase, {
        status: searchParams.get("status"),
        service_date: searchParams.get("service_date"),
        search: searchParams.get("search") || searchParams.get("q"),
        page: Number(searchParams.get("page") || 1),
        pageSize: Number(searchParams.get("pageSize") || searchParams.get("page_size") || 25)
      }),
      listCategories(auth.supabase),
      listYards(auth.supabase),
      ensureToday ? getOrCreateTodayLibraryBatch(auth.supabase, auth.actor) : Promise.resolve(null)
    ]);

    return NextResponse.json({
      ...listed,
      categories,
      yards,
      today_batch: todayBatch,
      permissions: {
        can_download: canDownload,
        can_upload: true,
        can_view: true
      },
      currentUser: {
        email: auth.session?.email ?? null,
        adminUserId: auth.session?.adminUserId ?? null,
        role: auth.session?.role ?? null
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load photo library.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const blocked = demoWriteGuard(request);
  if (blocked) return blocked;

  const auth = await requirePhotoUploadAccess(request);
  if (!isPhotoUploadAuthOk(auth)) return auth.error;

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (body.action === "ensure_today" || body.ensure_today) {
      const batch = await getOrCreateTodayLibraryBatch(auth.supabase, auth.actor);
      return NextResponse.json({ batch });
    }

    const batch = await getOrCreateTodayLibraryBatch(auth.supabase, auth.actor);
    return NextResponse.json({ batch });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to prepare photo library.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
