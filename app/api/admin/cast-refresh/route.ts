import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { signalCastDisplaysHardRefresh } from "@/lib/admin/signal-cast-hard-refresh";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const session = getAdminSessionFromRequest(request);
  const supabase = getServiceSupabase();
  const nonce = await signalCastDisplaysHardRefresh(supabase);

  await writeAdminAuditLog({
    actorAdminId: session?.adminUserId,
    actorEmail: session?.email,
    action: "admin.cast_hard_refresh",
    details: { cast_hard_reload_nonce: nonce }
  });

  return NextResponse.json({
    ok: true,
    cast_hard_reload_nonce: nonce,
    refreshed_at: new Date().toISOString()
  });
}
