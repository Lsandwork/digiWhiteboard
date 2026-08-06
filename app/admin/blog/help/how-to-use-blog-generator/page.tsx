import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin/session";
import { canAccessBlogGenerator, effectiveAccessLabel, hasPermission } from "@/lib/admin/permissions";
import { getUserAccess } from "@/lib/admin/user-access";
import { getAdminUserById } from "@/lib/admin/users";
import { isBlogEnabled } from "@/lib/blog/flags";
import { getBlogSettings } from "@/lib/blog/service";
import { getBlogDashboardData } from "@/lib/blog/dashboard-data";
import { resolveBlogTutorialVideo } from "@/lib/blog/help-guide";
import { getServiceSupabase } from "@/lib/supabase/server";
import { BlogHelpGuideClient } from "@/components/blog/help/BlogHelpGuideClient";
import "./blog-help.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "How to Use the Fitdog Blog Generator | RuffOps",
  description: "Fitdog Help Center guide for the Blog Generator: topics, drafts, review, schedule, and performance."
};

export default async function BlogHelpGuidePage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login?next=/admin/blog/help/how-to-use-blog-generator");
  if (session.mustChangePassword) redirect("/admin/login?next=/admin/blog/help/how-to-use-blog-generator");

  if (!isBlogEnabled() && session.role !== "owner_admin") {
    redirect("/admin?board=staff&tab=help");
  }

  const supabase = getServiceSupabase();
  const access = session.adminUserId
    ? await getUserAccess(supabase, session.adminUserId, session.role, session.email)
    : null;

  if (!canAccessBlogGenerator(access, session.role) && session.role !== "owner_admin") {
    redirect("/admin?board=staff&tab=help");
  }

  if (access && !hasPermission(access, "blog.view") && session.role !== "owner_admin") {
    redirect("/admin?board=staff&tab=help");
  }

  const adminUser = session.adminUserId ? await getAdminUserById(supabase, session.adminUserId) : null;
  const [settings, dashboard] = await Promise.all([getBlogSettings(), getBlogDashboardData("30d")]);
  const providerConfig =
    settings && typeof settings === "object" && "provider_config" in settings
      ? ((settings as { provider_config?: Record<string, unknown> }).provider_config ?? null)
      : null;
  const tutorialVideoUrl = resolveBlogTutorialVideo(providerConfig);
  const canConfigureTutorial =
    session.role === "owner_admin" || (access ? hasPermission(access, "blog.manage_automation") : false);

  return (
    <BlogHelpGuideClient
      displayName={adminUser?.full_name || session.email?.split("@")[0] || "Admin"}
      roleLabel={effectiveAccessLabel(access, session.role, session.email)}
      avatarUrl={adminUser?.avatar_url || null}
      notificationCount={dashboard.counts.needsReview || 0}
      tutorialVideoUrl={tutorialVideoUrl}
      canConfigureTutorial={canConfigureTutorial}
      impact={{
        views: {
          available: dashboard.kpis.totalViews.available,
          value: dashboard.kpis.totalViews.value,
          reason: dashboard.kpis.totalViews.reason
        },
        engagement: {
          available: dashboard.kpis.engagementRate.available,
          value: dashboard.kpis.engagementRate.value,
          reason: dashboard.kpis.engagementRate.reason
        },
        subscribers: {
          available: dashboard.kpis.newsletterSubs.available,
          value: dashboard.kpis.newsletterSubs.newInRange ?? dashboard.kpis.newsletterSubs.value,
          deltaPercent: dashboard.kpis.newsletterSubs.deltaPercent ?? null
        }
      }}
    />
  );
}
