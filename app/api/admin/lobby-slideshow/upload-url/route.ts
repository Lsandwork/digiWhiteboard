import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { hasPermission, isFullAdminLegacyRole } from "@/lib/admin/permissions";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { getUserAccess } from "@/lib/admin/user-access";
import { createLobbySlideshowSignedUpload } from "@/lib/lobby/slideshow-uploads";
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

  const { session, access } = await actorAccess(request);
  if (!canManageLobbySlideshow(access, session?.role)) {
    return NextResponse.json({ error: "You do not have permission to upload slideshow media." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as {
      fileName?: string;
      mimeType?: string;
      fileSize?: number;
    };

    const fileName = body.fileName?.trim();
    const mimeType = body.mimeType?.trim();
    const fileSize = Number(body.fileSize ?? 0);

    if (!fileName || !mimeType || !Number.isFinite(fileSize) || fileSize <= 0) {
      return NextResponse.json({ error: "Valid file metadata is required." }, { status: 400 });
    }

    const upload = await createLobbySlideshowSignedUpload(getServiceSupabase(), {
      fileName,
      mimeType,
      fileSize
    });

    return NextResponse.json(upload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to prepare slideshow upload.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
