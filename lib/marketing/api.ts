import { NextResponse } from "next/server";
import {
  canAccessMarketingPanel,
  canManageMarketing,
  forbiddenMarketingResponse,
  getMarketingActor,
  unauthorizedMarketingResponse
} from "@/lib/marketing/auth";

export const dynamic = "force-dynamic";

export async function requireMarketingAccess(request: Request, manage = false) {
  const actor = await getMarketingActor(request);
  if (!actor?.session) return { error: unauthorizedMarketingResponse() };
  const allowed = manage
    ? canManageMarketing(actor.session, actor.access)
    : canAccessMarketingPanel(actor.session, actor.access);
  if (!allowed) return { error: forbiddenMarketingResponse() };
  return { actor };
}

export function marketingJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}
