import { NextResponse } from "next/server";
import { createCastTvSignedUpload } from "@/lib/cast-tv/media";
import { inferCastTvMimeType } from "@/lib/cast-tv/mime";
import { requireCastTvManager } from "@/lib/cast-tv/api-auth";
import { blockDemoWrite } from "@/lib/admin/api-auth";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const demoBlock = blockDemoWrite(request);
  if (demoBlock) return demoBlock;

  const auth = await requireCastTvManager(request);
  if ("error" in auth) return auth.error;

  try {
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

    const supabase = getServiceSupabase({ timeoutMs: 20_000 });
    const target = await createCastTvSignedUpload(supabase, { fileName, mimeType, fileSize });
    return NextResponse.json(target);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to prepare CAST-TV upload.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
