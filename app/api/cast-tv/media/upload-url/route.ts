import { NextResponse } from "next/server";
import { createCastTvSignedUpload } from "@/lib/cast-tv/media";
import { inferCastTvMimeType } from "@/lib/cast-tv/mime";
import { handleCastTvWrite } from "@/lib/cast-tv/route-handler";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  return handleCastTvWrite(request, async () => {
    const body = await request.json();
    const fileName = String(body.fileName ?? "").trim();
    const mimeType = inferCastTvMimeType(fileName, String(body.mimeType ?? "").trim());
    const fileSize = Number(body.fileSize ?? 0);

    if (!fileName || !fileSize) {
      return NextResponse.json({ error: "fileName and fileSize are required." }, { status: 400 });
    }
    if (!mimeType) {
      return NextResponse.json(
        { error: "Could not determine the file type. Use JPG, PNG, WEBP, HEIC, MP4, WEBM, or MOV." },
        { status: 400 }
      );
    }

    const supabase = getServiceSupabase({ timeoutMs: 60_000 });
    const target = await createCastTvSignedUpload(supabase, { fileName, mimeType, fileSize });
    return NextResponse.json(target);
  }, "Unable to prepare CAST-TV upload.");
}
