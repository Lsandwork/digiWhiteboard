import { after, NextResponse } from "next/server";
import { accessFromLegacyRole } from "@/lib/admin/permissions";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { getUserAccess, migrateLegacyUserAccess } from "@/lib/admin/user-access";
import { ensureSuperAdminUsers } from "@/lib/admin/role-permission-matrix";
import { getAdminUserById } from "@/lib/admin/users";
import { getServiceSupabase } from "@/lib/supabase/server";
import { withTimeoutOrThrow } from "@/lib/server-ttl-cache";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

/** Cookie HMAC is enough to enter the app. DB enrichment is optional and must not stall login. */
const SESSION_QUERY_TIMEOUT_MS = 1_200;
const SESSION_ENRICH_BUDGET_MS = 800;

export async function GET(request: Request) {
  const session = getAdminSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const fallbackAccess = session.adminUserId
    ? accessFromLegacyRole(session.adminUserId, session.email, session.role)
    : null;

  const cookiePayload = {
    authenticated: true,
    username: session.email,
    adminUserId: session.adminUserId ?? null,
    role: session.role ?? null,
    isDemo: session.isDemo ?? false,
    demoRole: session.demoRole ?? null,
    mustChangePassword: session.mustChangePassword ?? false,
    access: fallbackAccess,
    impersonator: session.impersonatorEmail
      ? { email: session.impersonatorEmail, role: session.impersonatorRole ?? null }
      : null
  };

  const supabase = getServiceSupabase({ timeoutMs: SESSION_QUERY_TIMEOUT_MS });
  after(() => {
    void migrateLegacyUserAccess(supabase).catch(() => undefined);
    void ensureSuperAdminUsers(supabase).catch(() => undefined);
  });

  if (!session.adminUserId) {
    return NextResponse.json(cookiePayload);
  }

  const enrich = Promise.all([
    withTimeoutOrThrow(
      getAdminUserById(supabase, session.adminUserId),
      SESSION_QUERY_TIMEOUT_MS,
      "session profile"
    ).catch(() => null),
    withTimeoutOrThrow(
      getUserAccess(supabase, session.adminUserId, session.role, session.email),
      SESSION_QUERY_TIMEOUT_MS,
      "session access"
    ).catch(() => fallbackAccess)
  ]).then(([dbUser, access]) => ({
    role: session.role ?? dbUser?.role ?? null,
    mustChangePassword: Boolean(session.mustChangePassword || dbUser?.force_password_change),
    access: access ?? fallbackAccess
  }));

  const enriched = await Promise.race([
    enrich,
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), SESSION_ENRICH_BUDGET_MS);
    })
  ]).catch(() => null);

  if (!enriched) {
    return NextResponse.json(cookiePayload);
  }

  return NextResponse.json({
    ...cookiePayload,
    ...enriched
  });
}
