import { NextResponse } from "next/server";
import { isAdminRequest, blockDemoWrite, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { hasPermission, isFullAdminLegacyRole } from "@/lib/admin/permissions";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { getUserAccess } from "@/lib/admin/user-access";
import { bumpDisplayContentRevision } from "@/lib/display-sync-server";
import { createLobbySlideshowUploadRecord } from "@/lib/lobby/slideshow-uploads";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function actorAccess(request: Request) {
  const session = getAdminSessionFromRequest(request);
  const supabase = getServiceSupabase();
  const access = session?.adminUserId
    ? await getUserAccess(supabase, session.adminUserId, session.role, session.email)
    : null;
  return { session, access };
}

function canManageLobbySlideshow(access: Awaited<ReturnType<typeof actorAccess>>["access"], role?: string | null) {
  if (hasPermission(access, "manage_lobby_board")) return true;
  return isFullAdminLegacyRole(role);
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  const blocked = blockDemoWrite(request);
  if (blocked) return blocked;

  const { session, access } = await actorAccess(request);
  if (!canManageLobbySlideshow(access, session?.role)) {
    return NextResponse.json({ error: "You do not have permission to upload slideshow media." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as {
      fileName?: string;
      mimeType?: string;
      fileSize?: number;
      storagePath?: string;
      title?: string;
    };

    const fileName = body.fileName?.trim();
    const mimeType = body.mimeType?.trim();
    const fileSize = Number(body.fileSize ?? 0);
    const storagePath = body.storagePath?.trim();

    if (!fileName || !mimeType || !storagePath || !Number.isFinite(fileSize) || fileSize <= 0) {
      return NextResponse.json({ error: "Upload metadata is incomplete." }, { status: 400 });
    }

    const supabase = getServiceSupabase();
    const upload = await createLobbySlideshowUploadRecord(supabase, {
      fileName,
      mimeType,
      fileSize,
      storagePath,
      title: body.title ?? null,
      createdBy: session?.email ?? null
    });

    await bumpDisplayContentRevision(supabase);
    return NextResponse.json({ upload });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save slideshow upload.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
