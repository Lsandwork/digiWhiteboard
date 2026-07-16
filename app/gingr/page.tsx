import { redirect } from "next/navigation";
import { GingrPageClient } from "@/components/gingr/GingrPageClient";
import { ToastProvider } from "@/components/admin/ui/ToastProvider";
import { inspectGingrEmbedPolicy } from "@/lib/gingr/embed-policy";
import { getAdminSession } from "@/lib/admin/session";
import { getUserAccess } from "@/lib/admin/user-access";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function GingrRoutePage() {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login?next=/gingr");
  }
  if (session.mustChangePassword) {
    redirect("/admin/login?next=/gingr");
  }

  const supabase = getServiceSupabase();
  const access = session.adminUserId
    ? await getUserAccess(supabase, session.adminUserId, session.role, session.email)
    : null;

  const embedPolicy = await inspectGingrEmbedPolicy();

  return (
    <ToastProvider>
      <main className="admin-theme min-h-screen">
        <GingrPageClient
          username={session.email ?? "admin"}
          role={session.role ?? "staff"}
          access={access}
          embedAllowed={embedPolicy.allowed}
          embedBlockReason={embedPolicy.reason}
        />
      </main>
    </ToastProvider>
  );
}
