import { NextResponse } from "next/server";
import { isAdminRequest, blockDemoWrite, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { hasPermission, isFullAdminLegacyRole } from "@/lib/admin/permissions";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { getUserAccess } from "@/lib/admin/user-access";
import { bumpDisplayContentRevision } from "@/lib/display-sync-server";
import { deleteLobbySlideshowUpload } from "@/lib/lobby/slideshow-uploads";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

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

export async function DELETE(request: Request, context: RouteContext) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  const blocked = blockDemoWrite(request);
  if (blocked) return blocked;

  const { session, access } = await actorAccess(request);
  if (!canManageLobbySlideshow(access, session?.role)) {
    return NextResponse.json({ error: "You do not have permission to manage the lobby slideshow." }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const supabase = getServiceSupabase();
    const deleted = await deleteLobbySlideshowUpload(supabase, id);
    await bumpDisplayContentRevision(supabase);
    return NextResponse.json({ ok: true, upload: deleted });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete slideshow upload.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
