import Link from "next/link";
import { redirect } from "next/navigation";
import { UserGroupsPermissionsPage } from "@/components/admin/UserGroupsPermissionsPage";
import { ToastProvider } from "@/components/admin/ui/ToastProvider";
import { isSuperAdminAccess, isSuperAdminLegacyRole } from "@/lib/admin/permissions";
import { getAdminSession } from "@/lib/admin/session";
import { getUserAccess } from "@/lib/admin/user-access";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function UserGroupsPermissionsRoutePage() {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login?next=/admin/settings/user-groups-permissions");
  }

  const supabase = getServiceSupabase();
  const access = session.adminUserId
    ? await getUserAccess(supabase, session.adminUserId, session.role, session.email)
    : null;

  const allowed = isSuperAdminLegacyRole(session.role) || isSuperAdminAccess(access);

  if (!allowed) {
    return (
      <main className="admin-theme grid min-h-screen place-items-center p-6">
        <div className="admin-card max-w-lg p-8 text-center">
          <h1 className="text-xl font-bold text-white">Access restricted</h1>
          <p className="mt-3 text-sm text-admin-muted">
            Only Super Admin can manage user groups and permissions.
          </p>
          <Link href="/admin?tab=settings" className="admin-btn-secondary mt-6 inline-flex">
            Back to Settings
          </Link>
        </div>
      </main>
    );
  }

  return (
    <ToastProvider>
      <main className="admin-theme min-h-screen p-4 md:p-6">
        <UserGroupsPermissionsPage />
      </main>
    </ToastProvider>
  );
}
