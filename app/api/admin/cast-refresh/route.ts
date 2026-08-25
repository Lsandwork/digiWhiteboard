import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import {
  CAST_REFRESH_SIGNAL_TIMEOUT_MS,
  signalCastDisplaysHardRefresh
} from "@/lib/admin/signal-cast-hard-refresh";
import { getServiceSupabase } from "@/lib/supabase/server";
import { withTimeoutOrThrow } from "@/lib/server-ttl-cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 15;

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const session = getAdminSessionFromRequest(request);
  const supabase = getServiceSupabase();

  try {
    const result = await withTimeoutOrThrow(
      signalCastDisplaysHardRefresh(supabase),
      CAST_REFRESH_SIGNAL_TIMEOUT_MS,
      "Cast TV refresh"
    );

    void writeAdminAuditLog({
      actorAdminId: session?.adminUserId,
      actorEmail: session?.email,
      action: "admin.cast_hard_refresh",
      details: {
        cast_hard_reload_nonce: result.nonce,
        remote_cast_refreshed: result.remoteCastRefreshed
      }
    });

    return NextResponse.json({
      ok: true,
      cast_hard_reload_nonce: result.nonce,
      remote_cast_refreshed: result.remoteCastRefreshed,
      refreshed_at: new Date().toISOString()
    });
  } catch (error) {
    const message = error instanceof Error && error.message.trim() ? error.message.trim() : "Unable to refresh cast displays.";
    return NextResponse.json({ ok: false, error: message }, { status: 503 });
  }
}
