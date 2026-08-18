import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { signalCastDisplaysHardRefresh } from "@/lib/admin/signal-cast-hard-refresh";
import { loadFastPromptedCheckouts } from "@/lib/board-fast-checkout";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const session = getAdminSessionFromRequest(request);
  const supabase = getServiceSupabase();
  const [checkouts, nonce] = await Promise.all([
    loadFastPromptedCheckouts(supabase),
    signalCastDisplaysHardRefresh(supabase)
  ]);

  await writeAdminAuditLog({
    actorAdminId: session?.adminUserId,
    actorEmail: session?.email,
    action: "admin.refresh",
    details: {
      active_checkouts: checkouts.checking_out.length,
      cast_hard_reload_nonce: nonce
    }
  });

  return NextResponse.json({
    ok: true,
    refreshed_at: new Date().toISOString(),
    active_checkouts: checkouts.checking_out.length,
    last_synced_at: checkouts.newest_checkout_at,
    cast_hard_reload_nonce: nonce
  });
}
