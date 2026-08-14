import { NextResponse } from "next/server";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { getUserAccess, migrateLegacyUserAccess } from "@/lib/admin/user-access";
import { ensureSuperAdminUsers } from "@/lib/admin/role-permission-matrix";
import { getAdminUserById } from "@/lib/admin/users";
import { getServiceSupabase } from "@/lib/supabase/server";
import { withTimeoutFallback } from "@/lib/server-ttl-cache";

export const dynamic = "force-dynamic";

const SESSION_SIDE_EFFECT_MS = 2_500;

export async function GET(request: Request) {
  const session = getAdminSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  // Demo sessions are cookie-only — never block them on Supabase migrations.
  if (session.isDemo) {
    return NextResponse.json({
      authenticated: true,
      username: session.email,
      adminUserId: session.adminUserId ?? null,
      role: session.role ?? null,
      isDemo: true,
      demoRole: session.demoRole ?? null,
      mustChangePassword: false,
      access: null,
      impersonator: null
    });
  }

  let mustChangePassword = session.mustChangePassword ?? false;
  let access = null;

  try {
    const supabase = getServiceSupabase();
    await Promise.allSettled([
      withTimeoutFallback(migrateLegacyUserAccess(supabase).catch(() => undefined), SESSION_SIDE_EFFECT_MS, undefined),
      withTimeoutFallback(ensureSuperAdminUsers(supabase).catch(() => undefined), SESSION_SIDE_EFFECT_MS, undefined)
    ]);

    const dbUser = session.adminUserId
      ? await withTimeoutFallback(
          getAdminUserById(supabase, session.adminUserId).catch(() => null),
          SESSION_SIDE_EFFECT_MS,
          null
        )
      : null;
    mustChangePassword = Boolean(session.mustChangePassword || dbUser?.force_password_change);

    access = session.adminUserId
      ? await withTimeoutFallback(
          getUserAccess(supabase, session.adminUserId, session.role ?? dbUser?.role, session.email).catch(
            () => null
          ),
          SESSION_SIDE_EFFECT_MS,
          null
        )
      : null;
  } catch (error) {
    console.error("[admin.session] degraded response after Supabase failure", error);
  }

  return NextResponse.json({
    authenticated: true,
    username: session.email,
    adminUserId: session.adminUserId ?? null,
    role: session.role ?? null,
    isDemo: session.isDemo ?? false,
    demoRole: session.demoRole ?? null,
    mustChangePassword,
    access,
    impersonator: session.impersonatorEmail
      ? { email: session.impersonatorEmail, role: session.impersonatorRole ?? null }
      : null
  });
}
