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

const SESSION_QUERY_TIMEOUT_MS = 4_000;

export async function GET(request: Request) {
  const session = getAdminSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const supabase = getServiceSupabase({ timeoutMs: SESSION_QUERY_TIMEOUT_MS });
  after(() => {
    void migrateLegacyUserAccess(supabase).catch(() => undefined);
    void ensureSuperAdminUsers(supabase).catch(() => undefined);
  });

  const fallbackAccess = session.adminUserId
    ? accessFromLegacyRole(session.adminUserId, session.email, session.role)
    : null;

  const [dbUser, access] = await Promise.all([
    session.adminUserId
      ? withTimeoutOrThrow(
          getAdminUserById(supabase, session.adminUserId),
          SESSION_QUERY_TIMEOUT_MS,
          "session profile"
        ).catch(() => null)
      : Promise.resolve(null),
    session.adminUserId
      ? withTimeoutOrThrow(
          getUserAccess(supabase, session.adminUserId, session.role, session.email),
          SESSION_QUERY_TIMEOUT_MS,
          "session access"
        ).catch(() => fallbackAccess)
      : Promise.resolve(null)
  ]);

  const mustChangePassword = session.mustChangePassword || dbUser?.force_password_change || false;

  return NextResponse.json({
    authenticated: true,
    username: session.email,
    adminUserId: session.adminUserId ?? null,
    role: session.role ?? dbUser?.role ?? null,
    isDemo: session.isDemo ?? false,
    demoRole: session.demoRole ?? null,
    mustChangePassword,
    access,
    impersonator: session.impersonatorEmail
      ? { email: session.impersonatorEmail, role: session.impersonatorRole ?? null }
      : null
  });
}
