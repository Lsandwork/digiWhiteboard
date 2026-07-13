import { marketingJson, requireMarketingAccess } from "@/lib/marketing/api";
import {
  listMarketingNotifications,
  markAllMarketingNotificationsRead,
  markMarketingNotificationRead
} from "@/lib/marketing/notifications";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireMarketingAccess(request);
  if (gate.error) return gate.error;
  const unreadOnly = new URL(request.url).searchParams.get("unreadOnly") === "1";
  try {
    const notifications = await listMarketingNotifications(
      gate.actor!.supabase,
      gate.actor!.session.adminUserId,
      gate.actor!.session.role,
      { unreadOnly, limit: 50 }
    );
    return marketingJson({ notifications });
  } catch (error) {
    return marketingJson({ error: error instanceof Error ? error.message : "Unable to load notifications." }, 500);
  }
}

export async function POST(request: Request) {
  const gate = await requireMarketingAccess(request);
  if (gate.error) return gate.error;
  const body = (await request.json()) as { action?: string; id?: string };
  try {
    if (body.action === "mark_all_read") {
      await markAllMarketingNotificationsRead(gate.actor!.supabase, gate.actor!.session.adminUserId);
      return marketingJson({ ok: true });
    }
    if (body.action === "mark_read" && body.id) {
      await markMarketingNotificationRead(gate.actor!.supabase, body.id, gate.actor!.session.adminUserId);
      return marketingJson({ ok: true });
    }
    return marketingJson({ error: "Unknown action." }, 400);
  } catch (error) {
    return marketingJson({ error: error instanceof Error ? error.message : "Notification action failed." }, 500);
  }
}
