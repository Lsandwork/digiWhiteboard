import { NextResponse } from "next/server";
import { getAdminSessionFromRequest, type AdminSession } from "@/lib/admin/session";
import { isFullAdminLegacyRole } from "@/lib/admin/permissions";
import { isDemoSession, demoWriteBlockedMessage } from "@/lib/demo/session";
import { RECEIVER_TOKEN_HEADER } from "@/lib/remote-cast/types";

export type AdminGuardResult =
  | { ok: true; session: AdminSession; actorEmail: string | null }
  | { ok: false; response: NextResponse };

/** Remote Cast admin routes require a full admin (owner/manager) session. */
export function requireRemoteCastAdmin(request: Request): AdminGuardResult {
  const session = getAdminSessionFromRequest(request);
  if (!session) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };
  }
  if (!isFullAdminLegacyRole(session.role)) {
    return { ok: false, response: NextResponse.json({ error: "Admin access required." }, { status: 403 }) };
  }
  return { ok: true, session, actorEmail: session.email ?? null };
}

/** Demo sessions can browse but must not control real displays. */
export function blockRemoteCastDemoWrite(request: Request): NextResponse | null {
  const session = getAdminSessionFromRequest(request);
  if (!isDemoSession(session)) return null;
  return NextResponse.json({ ok: true, demo: true, message: demoWriteBlockedMessage() });
}

export function readReceiverToken(request: Request): string | null {
  const header = request.headers.get(RECEIVER_TOKEN_HEADER)?.trim();
  return header ? header : null;
}
