import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { signalCastDisplaysHardRefresh } from "@/lib/admin/signal-cast-hard-refresh";
import { loadFastPromptedCheckouts } from "@/lib/board-fast-checkout";
import { FAST_CHECKOUT_QUERY_TIMEOUT_MS } from "@/lib/board-fast-checkout";
import { getServiceSupabase } from "@/lib/supabase/server";
import { withTimeoutFallback } from "@/lib/server-ttl-cache";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const session = getAdminSessionFromRequest(request);
  const supabase = getServiceSupabase({ timeoutMs: FAST_CHECKOUT_QUERY_TIMEOUT_MS });
  const emptyCheckouts = {
    checking_out: [] as Awaited<ReturnType<typeof loadFastPromptedCheckouts>>["checking_out"],
    newest_checkout_at: null as string | null
  };

  const [checkouts, castRefresh] = await Promise.all([
    withTimeoutFallback(
      loadFastPromptedCheckouts(supabase),
      FAST_CHECKOUT_QUERY_TIMEOUT_MS,
      emptyCheckouts
    ),
    withTimeoutFallback(signalCastDisplaysHardRefresh(supabase), FAST_CHECKOUT_QUERY_TIMEOUT_MS, {
      nonce: 0,
      remoteCastRefreshed: 0
    })
  ]);

  await writeAdminAuditLog({
    actorAdminId: session?.adminUserId,
    actorEmail: session?.email,
    action: "admin.refresh",
    details: {
      active_checkouts: checkouts.checking_out.length,
      cast_hard_reload_nonce: castRefresh.nonce,
      remote_cast_refreshed: castRefresh.remoteCastRefreshed
    }
  }).catch(() => undefined);

  return NextResponse.json({
    ok: true,
    refreshed_at: new Date().toISOString(),
    active_checkouts: checkouts.checking_out.length,
    last_synced_at: checkouts.newest_checkout_at,
    cast_hard_reload_nonce: castRefresh.nonce,
    remote_cast_refreshed: castRefresh.remoteCastRefreshed,
    delayed: checkouts.checking_out.length === 0 && castRefresh.nonce === 0
  });
}
