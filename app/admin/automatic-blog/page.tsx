import { redirect } from "next/navigation";
import { ToastProvider } from "@/components/admin/ui/ToastProvider";
import { BlogPageClient } from "@/components/blog/shell/BlogPageClient";
import { getAdminSession } from "@/lib/admin/session";
import { canAccessBlogGenerator } from "@/lib/admin/permissions";
import { resolveSessionAccess } from "@/lib/admin/resolve-user-access";
import { getAdminUserById } from "@/lib/admin/users";
import { isBlogEnabled } from "@/lib/blog/flags";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AutomaticBlogPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login?next=/admin/automatic-blog");
  if (session.mustChangePassword) redirect("/admin/login?next=/admin/automatic-blog");

  if (!isBlogEnabled() && session.role !== "owner_admin") {
    redirect(
      session.role === "marketing"
        ? "/admin?board=marketing&tab=sa_apps_hub"
        : "/admin?board=staff&tab=sa_apps_hub"
    );
  }

  const supabase = getServiceSupabase();
  const access = await resolveSessionAccess(session, supabase);
  const adminUser = session.adminUserId ? await getAdminUserById(supabase, session.adminUserId) : null;

  if (!canAccessBlogGenerator(access, session.role, session.email, adminUser?.full_name)) {
    redirect(
      session.role === "marketing"
        ? "/admin?board=marketing&tab=sa_apps_hub"
        : "/admin?board=staff&tab=sa_apps_hub"
    );
  }

  return (
    <ToastProvider>
      <main className="admin-theme min-h-screen">
        <BlogPageClient
          username={session.email ?? "admin"}
          role={session.role ?? "staff"}
          access={access}
          displayName={adminUser?.full_name || session.email?.split("@")[0] || "Admin"}
          avatarUrl={adminUser?.avatar_url || null}
        />
      </main>
    </ToastProvider>
  );
}
