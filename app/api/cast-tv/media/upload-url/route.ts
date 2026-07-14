import { NextResponse } from "next/server";
import { createCastTvSignedUpload } from "@/lib/cast-tv/media";
import { requireCastTvManager } from "@/lib/cast-tv/api-auth";
import { blockDemoWrite } from "@/lib/admin/api-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const demoBlock = blockDemoWrite(request);
  if (demoBlock) return demoBlock;

  const auth = await requireCastTvManager(request);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const fileName = String(body.fileName ?? "").trim();
    const mimeType = String(body.mimeType ?? "").trim();
    const fileSize = Number(body.fileSize ?? 0);

    if (!fileName || !mimeType || !fileSize) {
      return NextResponse.json({ error: "fileName, mimeType, and fileSize are required." }, { status: 400 });
    }

    const target = await createCastTvSignedUpload(auth.supabase, { fileName, mimeType, fileSize });
    return NextResponse.json(target);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to prepare CAST-TV upload.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
