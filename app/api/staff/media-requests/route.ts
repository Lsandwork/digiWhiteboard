import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { hasPermission } from "@/lib/admin/permissions";
import { getUserAccess } from "@/lib/admin/user-access";
import { canRespondToMarketingRequest } from "@/lib/marketing/auth";
import { applyStaffMediaRequestAction, loadMarketingMediaRequestBoardState } from "@/lib/marketing/media-requests";
import { getServiceSupabase } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = getServiceSupabase();
    const state = await loadMarketingMediaRequestBoardState(supabase);
    return NextResponse.json({ ...state, healthy: true });
  } catch (error) {
    return NextResponse.json(
      { activeRequest: null, queue: [], healthy: false, error: error instanceof Error ? error.message : "Load failed." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  const session = getAdminSessionFromRequest(request);
  const supabase = getServiceSupabase();
  const access = session?.adminUserId
    ? await getUserAccess(supabase, session.adminUserId, session.role, session.email)
    : null;

  if (!hasPermission(access, "respond_marketing_media_request") && !canRespondToMarketingRequest(session?.role)) {
    return NextResponse.json({ error: "You do not have permission to respond to media requests." }, { status: 403 });
  }

  const body = (await request.json()) as { requestId?: string; action?: string };
  const requestId = String(body.requestId ?? "");
  const action = String(body.action ?? "");
  if (!requestId || !action) return NextResponse.json({ error: "requestId and action are required." }, { status: 400 });

  try {
    const updated = await applyStaffMediaRequestAction(supabase, requestId, action, {
      id: session?.adminUserId ?? null,
      email: session?.email ?? null,
      name: session?.email?.split("@")[0] ?? null,
      role: session?.role ?? null
    });
    return NextResponse.json({ request: updated });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Action failed." }, { status: 400 });
  }
}
