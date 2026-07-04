import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { loadAdminSettings, updateAdminSettings } from "@/lib/admin/settings";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  const settings = await loadAdminSettings(getServiceSupabase());
  return NextResponse.json({ settings });
}

export async function PATCH(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const session = getAdminSessionFromRequest(request);
  const body = (await request.json()) as Record<string, unknown>;
  const supabase = getServiceSupabase();
  const settings = await updateAdminSettings(supabase, body);

  await writeAdminAuditLog({
    actorAdminId: session?.adminUserId,
    actorEmail: session?.email,
    action: "admin.settings.update",
    targetType: "admin_settings",
    targetId: "default",
    details: { keys: Object.keys(body) }
  });

  return NextResponse.json({ settings });
}
