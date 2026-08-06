import { redirect } from "next/navigation";
import { ToastProvider } from "@/components/admin/ui/ToastProvider";
import { BlogPageClient } from "@/components/blog/shell/BlogPageClient";
import { getAdminSession } from "@/lib/admin/session";
import { canAccessBlogGenerator, hasPermission } from "@/lib/admin/permissions";
import { getUserAccess } from "@/lib/admin/user-access";
import { getAdminUserById } from "@/lib/admin/users";
import { isBlogEnabled } from "@/lib/blog/flags";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AutomaticBlogPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login?next=/admin/automatic-blog");
  if (session.mustChangePassword) redirect("/admin/login?next=/admin/automatic-blog");

  if (!isBlogEnabled() && session.role !== "owner_admin") {
    redirect("/admin?board=staff&tab=help");
  }

  const supabase = getServiceSupabase();
  const access = session.adminUserId
    ? await getUserAccess(supabase, session.adminUserId, session.role, session.email)
    : null;

  if (!canAccessBlogGenerator(access, session.role) && session.role !== "owner_admin") {
    redirect("/admin?board=staff&tab=crossover_communication");
  }

  if (access && !hasPermission(access, "blog.view") && session.role !== "owner_admin") {
    redirect("/admin?board=staff&tab=crossover_communication");
  }

  const adminUser = session.adminUserId ? await getAdminUserById(supabase, session.adminUserId) : null;

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
