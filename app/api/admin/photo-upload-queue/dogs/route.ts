import { NextResponse } from "next/server";
import { loadCheckedInDogsForDate } from "@/lib/photo-upload-queue/service";
import { isPhotoUploadAuthOk, requirePhotoUploadAccess } from "@/lib/photo-upload-queue/api-guard";
import { pacificDateKey } from "@/lib/staff/front-desk-log";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requirePhotoUploadAccess(request);
  if (!isPhotoUploadAuthOk(auth)) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const serviceDate =
      searchParams.get("service_date")?.trim() ||
      searchParams.get("date")?.trim() ||
      pacificDateKey(new Date()) ||
      new Date().toISOString().slice(0, 10);

    const result = await loadCheckedInDogsForDate(auth.supabase, serviceDate);
    return NextResponse.json({
      service_date: serviceDate,
      dogs: result.dogs,
      warning: result.warning ?? null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load checked-in dogs.";
    return NextResponse.json(
      {
        dogs: [],
        warning: message
      },
      { status: 200 }
    );
  }
}
