import { NextResponse } from "next/server";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { getUserAccess } from "@/lib/admin/user-access";
import { getServiceSupabase } from "@/lib/supabase/server";
import { accessFromLegacyRole, hasPermission } from "@/lib/admin/permissions";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getOpsDogProfile } from "@/lib/ops-command-center/profile";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ dogId: string }> }) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  const session = getAdminSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceSupabase();
  const access =
    (await getUserAccess(supabase, session.adminUserId, session.role, session.email)) ??
    accessFromLegacyRole(null, session.email, session.role);
  const canView =
    hasPermission(access, "view_ops_dog_profile") ||
    hasPermission(access, "view_my_shift") ||
    hasPermission(access, "view_ops_command_center") ||
    hasPermission(access, "view_admin_panel");
  if (!canView) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { dogId } = await context.params;
  const profile = await getOpsDogProfile(dogId);
  if (!profile) return NextResponse.json({ error: "Dog not found" }, { status: 404 });
  return NextResponse.json(profile);
}
