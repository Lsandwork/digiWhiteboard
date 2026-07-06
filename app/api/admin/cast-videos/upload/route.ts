import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { hasPermission } from "@/lib/admin/permissions";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { getUserAccess } from "@/lib/admin/user-access";
import { uploadCastThumbnailAsset, uploadCastVideoAsset } from "@/lib/staff/cast-video-storage";

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
    const form = await request.formData();
    const video = form.get("video");
    const thumbnail = form.get("thumbnail");
    const noticeId = String(form.get("noticeId") ?? "").trim() || undefined;

    if (!(video instanceof File)) {
      return NextResponse.json({ error: "Video file is required." }, { status: 400 });
    }

    const uploadedVideo = await uploadCastVideoAsset({ file: video, kind: "video", noticeId });
    let uploadedThumbnail: Awaited<ReturnType<typeof uploadCastThumbnailAsset>> | null = null;
    if (thumbnail instanceof File && thumbnail.size > 0) {
      uploadedThumbnail = await uploadCastThumbnailAsset(thumbnail, noticeId);
    }

    return NextResponse.json({
      video_storage_path: uploadedVideo.storage_path,
      video_url: uploadedVideo.signed_url,
      thumbnail_storage_path: uploadedThumbnail?.storage_path ?? null,
      thumbnail_url: uploadedThumbnail?.signed_url ?? null,
      mime_type: uploadedVideo.mime_type,
      file_size_bytes: uploadedVideo.file_size_bytes
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to upload cast video.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
