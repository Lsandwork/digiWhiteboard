import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin/session";
import {
  accessFromLegacyRole,
  canReviewManagementSupportForUser,
  canSubmitWriteUpForUser
} from "@/lib/admin/permissions";

export default async function AdminManagementSupportPage() {
  const session = await getAdminSession();
  const role = session?.role ?? null;
  const access = accessFromLegacyRole(session?.adminUserId ?? null, session?.email ?? null, role);

  if (canReviewManagementSupportForUser(access, role)) {
    redirect("/admin?board=staff&tab=ms_hub");
  }

  if (canSubmitWriteUpForUser(access, role)) {
    redirect("/admin?board=staff&tab=management_support");
  }

  redirect("/admin?board=staff");
}
