import { redirect } from "next/navigation";
import { ToastProvider } from "@/components/admin/ui/ToastProvider";
import { RufflyPageClient } from "@/components/ruffly/shell/RufflyPageClient";
import { getAdminSession } from "@/lib/admin/session";
import { hasPermission } from "@/lib/admin/permissions";
import { getUserAccess } from "@/lib/admin/user-access";
import { isRufflyEnabled } from "@/lib/ruffly/flags";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function RufflyRoutePage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login?next=/ruffly");
  if (session.mustChangePassword) redirect("/admin/login?next=/ruffly");

  if (!isRufflyEnabled() && session.role !== "owner_admin") {
    redirect("/admin?board=staff&tab=help");
  }

  const supabase = getServiceSupabase();
  const access = session.adminUserId
    ? await getUserAccess(supabase, session.adminUserId, session.role, session.email)
    : null;

  if (access && !hasPermission(access, "ruffly.view") && session.role !== "owner_admin") {
    redirect("/admin?board=staff&tab=crossover_communication");
  }

  return (
    <ToastProvider>
      <main className="admin-theme min-h-screen">
        <RufflyPageClient
          username={session.email ?? "admin"}
          role={session.role ?? "staff"}
          access={access}
          flags={{
            enabled: isRufflyEnabled() || session.role === "owner_admin",
            webchat: process.env.RUFFLY_WEBCHAT_ENABLED === "true",
            ai: process.env.RUFFLY_AI_ENABLED === "true",
            voice: process.env.RUFFLY_VOICE_ENABLED === "true",
            campaigns: process.env.RUFFLY_CAMPAIGNS_ENABLED === "true",
            automations: process.env.RUFFLY_AUTOMATIONS_ENABLED === "true"
          }}
        />
      </main>
    </ToastProvider>
  );
}
