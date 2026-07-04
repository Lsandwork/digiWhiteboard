import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import {
  AdminUserRole,
  deleteAdminUser,
  getAdminUserById,
  updateAdminUser
} from "@/lib/admin/users";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function canManageUsers(role?: string) {
  return role === "owner_admin" || role === "manager_admin" || !role;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const session = getAdminSessionFromRequest(request);
  if (!canManageUsers(session?.role)) {
    return NextResponse.json({ error: "You do not have permission to edit users." }, { status: 403 });
  }

  const { id } = await context.params;
  const body = (await request.json()) as {
    full_name?: string;
    email?: string;
    role?: AdminUserRole;
    status?: "active" | "disabled";
    force_password_change?: boolean;
  };

  if (session?.adminUserId === id && body.status === "disabled") {
    return NextResponse.json({ error: "You cannot disable your own account." }, { status: 400 });
  }

  const supabase = getServiceSupabase();
  const existing = await getAdminUserById(supabase, id);
  if (!existing) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const user = await updateAdminUser(supabase, id, {
    full_name: body.full_name != null ? String(body.full_name).trim() : undefined,
    email: body.email != null ? String(body.email).trim().toLowerCase() : undefined,
    role: body.role,
    status: body.status,
    force_password_change: body.force_password_change
  });

  await writeAdminAuditLog({
    actorAdminId: session?.adminUserId,
    actorEmail: session?.email,
    action: body.status === "disabled" ? "admin.user.disable" : "admin.user.update",
    targetType: "admin_user",
    targetId: id,
    details: body
  });

  return NextResponse.json({ user });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const session = getAdminSessionFromRequest(request);
  if (!canManageUsers(session?.role)) {
    return NextResponse.json({ error: "You do not have permission to delete users." }, { status: 403 });
  }

  const { id } = await context.params;
  if (session?.adminUserId === id) {
    return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
  }

  const supabase = getServiceSupabase();
  const existing = await getAdminUserById(supabase, id);
  if (!existing) return NextResponse.json({ error: "User not found." }, { status: 404 });

  await deleteAdminUser(supabase, id);

  await writeAdminAuditLog({
    actorAdminId: session?.adminUserId,
    actorEmail: session?.email,
    action: "admin.user.delete",
    targetType: "admin_user",
    targetId: id,
    details: { email: existing.email }
  });

  return NextResponse.json({ ok: true });
}
