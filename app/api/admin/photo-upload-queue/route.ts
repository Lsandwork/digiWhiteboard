import { NextResponse } from "next/server";
import {
  createBatch,
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
    const [listed, categories, yards] = await Promise.all([
      listBatches(auth.supabase, {
        status: searchParams.get("status"),
        service_date: searchParams.get("service_date"),
        search: searchParams.get("search") || searchParams.get("q"),
        page: Number(searchParams.get("page") || 1),
        pageSize: Number(searchParams.get("pageSize") || searchParams.get("page_size") || 25)
      }),
      listCategories(auth.supabase),
      listYards(auth.supabase)
    ]);

    return NextResponse.json({
      ...listed,
      categories,
      yards,
      currentUser: {
        email: auth.session?.email ?? null,
        adminUserId: auth.session?.adminUserId ?? null,
        role: auth.session?.role ?? null,
        access: auth.access
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load photo upload queue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const blocked = demoWriteGuard(request);
  if (blocked) return blocked;

  const auth = await requirePhotoUploadAccess(request);
  if (!isPhotoUploadAuthOk(auth)) return auth.error;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const batch = await createBatch(
      auth.supabase,
      {
        batch_name: body.batch_name != null ? String(body.batch_name) : undefined,
        service_date: String(body.service_date ?? ""),
        photographer_name: String(body.photographer_name ?? ""),
        photographer_user_id:
          body.photographer_user_id != null ? String(body.photographer_user_id) : auth.actor.id,
        default_yard: body.default_yard != null ? String(body.default_yard) : undefined,
        default_category: body.default_category != null ? String(body.default_category) : undefined,
        internal_note: body.internal_note != null ? String(body.internal_note) : null
      },
      auth.actor
    );
    return NextResponse.json({ batch });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create batch.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
