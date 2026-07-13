import { marketingJson, requireMarketingAccess } from "@/lib/marketing/api";
import { getUserAccess } from "@/lib/admin/user-access";
import { countUnreadMarketingNotifications } from "@/lib/marketing/notifications";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireMarketingAccess(request);
  if (gate.error) return gate.error;
  const { session, access, supabase } = gate.actor!;
  const unread = await countUnreadMarketingNotifications(supabase, session.adminUserId);
  return marketingJson({
    authenticated: true,
    email: session.email,
    adminUserId: session.adminUserId ?? null,
    role: session.role ?? null,
    access: session.adminUserId
      ? await getUserAccess(supabase, session.adminUserId, session.role, session.email)
      : access,
    unreadNotifications: unread
  });
}
