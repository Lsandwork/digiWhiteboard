import { redirect } from "next/navigation";
import { ToastProvider } from "@/components/admin/ui/ToastProvider";
import { GingrRouteGeneratorPageClient } from "@/components/gingr-route-generator/GingrRouteGeneratorPageClient";
import { getAdminSession } from "@/lib/admin/session";
import { canAccessRouteGenerator } from "@/lib/admin/permissions";
import { resolveSessionAccess } from "@/lib/admin/resolve-user-access";
import { getAdminUserById } from "@/lib/admin/users";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function GingrRouteGeneratorPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login?next=/admin/gingr-route-generator");
  if (session.mustChangePassword) redirect("/admin/login?next=/admin/gingr-route-generator");

  const supabase = getServiceSupabase();
  const access = await resolveSessionAccess(session, supabase);
  const adminUser = session.adminUserId ? await getAdminUserById(supabase, session.adminUserId) : null;

  if (!canAccessRouteGenerator(access, session.role)) {
    redirect(
      session.role === "marketing"
        ? "/admin?board=marketing&tab=sa_apps_hub"
        : "/admin?board=staff&tab=sa_apps_hub"
    );
  }

  return (
    <ToastProvider>
      <main className="admin-theme min-h-screen">
        <GingrRouteGeneratorPageClient
          username={session.email ?? "admin"}
          role={session.role ?? "staff"}
          access={access}
          displayName={adminUser?.full_name || session.email?.split("@")[0] || "Admin"}
        />
      </main>
    </ToastProvider>
  );
}
