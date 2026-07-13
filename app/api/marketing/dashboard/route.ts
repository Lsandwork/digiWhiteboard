import { marketingJson, requireMarketingAccess } from "@/lib/marketing/api";
import { loadMarketingDashboard } from "@/lib/marketing/dashboard";
import { countUnreadMarketingNotifications } from "@/lib/marketing/notifications";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireMarketingAccess(request);
  if (gate.error) return gate.error;
  try {
    const dashboard = await loadMarketingDashboard(gate.actor!.supabase);
    const unreadCount = await countUnreadMarketingNotifications(
      gate.actor!.supabase,
      gate.actor!.session.adminUserId
    );
    return marketingJson({
      ...dashboard,
      unreadNotifications: unreadCount,
      currentUser: {
        email: gate.actor!.session.email,
        adminUserId: gate.actor!.session.adminUserId ?? null,
        role: gate.actor!.session.role ?? null
      }
    });
  } catch (error) {
    return marketingJson(
      { error: error instanceof Error ? error.message : "Unable to load dashboard." },
      500
    );
  }
}
