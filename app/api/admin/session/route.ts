import { NextResponse } from "next/server";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { getUserAccess, migrateLegacyUserAccess } from "@/lib/admin/user-access";
import { ensureSuperAdminUsers } from "@/lib/admin/role-permission-matrix";
import { getAdminUserById } from "@/lib/admin/users";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = getAdminSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const supabase = getServiceSupabase();
  await migrateLegacyUserAccess(supabase).catch(() => undefined);
  await ensureSuperAdminUsers(supabase).catch(() => undefined);

  const dbUser = session.adminUserId ? await getAdminUserById(supabase, session.adminUserId) : null;
  const mustChangePassword = session.mustChangePassword || dbUser?.force_password_change || false;
  const access = session.adminUserId
    ? await getUserAccess(supabase, session.adminUserId, session.role ?? dbUser?.role, session.email)
    : null;

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
