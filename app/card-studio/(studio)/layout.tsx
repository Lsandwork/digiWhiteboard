import { redirect } from "next/navigation";
import { forbidden } from "next/navigation";
import { ToastProvider } from "@/components/admin/ui/ToastProvider";
import { getAdminSession } from "@/lib/admin/session";
import { canAccessCardStudio } from "@/lib/admin/permissions";
import { resolveSessionAccess } from "@/lib/admin/resolve-user-access";
import { CardStudioShell } from "@/components/card-studio/CardStudioShell";

export const dynamic = "force-dynamic";

export default async function CardStudioStudioLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login?next=/card-studio");
  if (session.mustChangePassword) redirect("/admin/login?next=/card-studio");
  const access = await resolveSessionAccess(session);
  if (!canAccessCardStudio(access, session.role)) {
    forbidden();
  }
  return (
    <ToastProvider>
      <CardStudioShell
        username={session.email ?? "staff"}
        role={session.role ?? "staff"}
        access={access}
      >
        {children}
      </CardStudioShell>
    </ToastProvider>
  );
}
