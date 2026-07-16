import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import {
  ADMIN_SESSION_COOKIE,
  createAdminSessionToken,
  getAdminSessionCookieOptions,
  getAdminSessionFromRequest
} from "@/lib/admin/session";
import { isDemoSession } from "@/lib/demo/session";
import { getAdminUserById, isAdminOrManagementRole, isFullAdminRole } from "@/lib/admin/users";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Start impersonating a staff member ("Log In As Employee"). */
export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const session = getAdminSessionFromRequest(request);
  if (!session) return unauthorizedAdminResponse();

  if (isDemoSession(session)) {
    return NextResponse.json({ error: "Impersonation is not available in demo mode." }, { status: 403 });
  }

  if (!isAdminOrManagementRole(session.role)) {
    return NextResponse.json(
      { error: "Only Super Admin, Admin, and Management can log in as an employee." },
      { status: 403 }
    );
  }

  if (session.impersonatorEmail) {
    return NextResponse.json(
      { error: "You are already logged in as an employee. Return to your account first." },
      { status: 409 }
    );
  }

  try {
    const body = (await request.json()) as { targetAdminUserId?: string };
    const targetAdminUserId = String(body.targetAdminUserId ?? "").trim();
    if (!targetAdminUserId) {
      return NextResponse.json({ error: "A target employee is required." }, { status: 400 });
    }

    if (targetAdminUserId === session.adminUserId) {
      return NextResponse.json({ error: "You cannot log in as your own account." }, { status: 400 });
    }

    const supabase = getServiceSupabase();
    const target = await getAdminUserById(supabase, targetAdminUserId);
    if (!target) {
      return NextResponse.json({ error: "That employee does not have a dashboard login." }, { status: 404 });
    }
    if (target.status !== "active") {
      return NextResponse.json({ error: "That employee's login is disabled." }, { status: 400 });
    }

    // Management (non-full-admin) may not impersonate Super Admin / Admin accounts.
    if (!isFullAdminRole(session.role) && isFullAdminRole(target.role)) {
      return NextResponse.json(
        { error: "Management cannot log in as a Super Admin or Admin account." },
        { status: 403 }
      );
    }

    const token = createAdminSessionToken({
      email: target.email,
      adminUserId: target.id,
      role: target.role,
      mustChangePassword: false,
      isDemo: false,
      impersonatorEmail: session.email,
      impersonatorAdminId: session.adminUserId,
      impersonatorRole: session.role
    });

    await writeAdminAuditLog({
      actorAdminId: session.adminUserId,
      actorEmail: session.email,
      action: "admin.impersonate.start",
      targetType: "admin_user",
      targetId: target.id,
      details: { target_email: target.email, target_role: target.role }
    });

    const response = NextResponse.json({ ok: true, email: target.email, role: target.role });
    response.cookies.set(ADMIN_SESSION_COOKIE, token, getAdminSessionCookieOptions());
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to log in as employee.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Stop impersonating and restore the original admin session. */
export async function DELETE(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const session = getAdminSessionFromRequest(request);
  if (!session) return unauthorizedAdminResponse();

  if (!session.impersonatorEmail) {
    return NextResponse.json({ error: "You are not currently logged in as an employee." }, { status: 400 });
  }

  try {
    const token = createAdminSessionToken({
      email: session.impersonatorEmail,
      adminUserId: session.impersonatorAdminId,
      role: session.impersonatorRole,
      mustChangePassword: false,
      isDemo: false
    });

    await writeAdminAuditLog({
      actorAdminId: session.impersonatorAdminId,
      actorEmail: session.impersonatorEmail,
      action: "admin.impersonate.stop",
      targetType: "admin_user",
      targetId: session.adminUserId,
      details: { impersonated_email: session.email }
    });

    const response = NextResponse.json({ ok: true, email: session.impersonatorEmail });
    response.cookies.set(ADMIN_SESSION_COOKIE, token, getAdminSessionCookieOptions());
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to return to your account.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
