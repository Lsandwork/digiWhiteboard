import { NextResponse } from "next/server";
import { isAdminRequest, blockDemoWrite, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { hasPermission, isFullAdminLegacyRole } from "@/lib/admin/permissions";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { getUserAccess } from "@/lib/admin/user-access";
import { loadLobbySlideshowUploads } from "@/lib/lobby/slideshow-uploads";
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

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const { session, access } = await actorAccess(request);
  if (!canManageLobbySlideshow(access, session?.role)) {
    return NextResponse.json({ error: "You do not have permission to manage the lobby slideshow." }, { status: 403 });
  }

  try {
    const uploads = await loadLobbySlideshowUploads(getServiceSupabase());
    return NextResponse.json({ uploads });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load slideshow uploads.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
