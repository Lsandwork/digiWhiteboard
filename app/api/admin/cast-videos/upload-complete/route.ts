import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { hasPermission } from "@/lib/admin/permissions";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { getUserAccess } from "@/lib/admin/user-access";
import { finalizeCastVideoUpload } from "@/lib/staff/cast-video-storage";

export const dynamic = "force-dynamic";

async function actorAccess(request: Request) {
  const session = getAdminSessionFromRequest(request);
  const { getServiceSupabase } = await import("@/lib/supabase/server");
  const supabase = getServiceSupabase();
  const access = session?.adminUserId
    ? await getUserAccess(supabase, session.adminUserId, session.role, session.email)
    : null;
  return { session, access };
}

function canManageCastVideos(access: Awaited<ReturnType<typeof actorAccess>>["access"], role?: string | null) {
  if (hasPermission(access, "manage_cast_videos")) return true;
  return role === "owner_admin" || role === "manager_admin";
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const { session, access } = await actorAccess(request);
  if (!canManageCastVideos(access, session?.role)) {
    return NextResponse.json({ error: "You do not have permission to upload cast videos." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as {
      storagePath?: string;
      mimeType?: string;
      fileSize?: number;
      kind?: "video" | "thumbnail";
    };

    const storagePath = body.storagePath?.trim();
    const mimeType = body.mimeType?.trim();
    const fileSize = Number(body.fileSize ?? 0);
    const kind = body.kind === "thumbnail" ? "thumbnail" : "video";

    if (!storagePath || !mimeType || !Number.isFinite(fileSize) || fileSize <= 0) {
      return NextResponse.json({ error: "Upload metadata is incomplete." }, { status: 400 });
    }

    const finalized = await finalizeCastVideoUpload({
      storagePath,
      mimeType,
      fileSize
    });

    if (kind === "thumbnail") {
      return NextResponse.json({
        thumbnail_storage_path: finalized.storage_path,
        thumbnail_url: finalized.signed_url,
        mime_type: finalized.mime_type,
        file_size_bytes: finalized.file_size_bytes
      });
    }

    return NextResponse.json({
      video_storage_path: finalized.storage_path,
      video_url: finalized.signed_url,
      mime_type: finalized.mime_type,
      file_size_bytes: finalized.file_size_bytes
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to finalize cast video upload.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
