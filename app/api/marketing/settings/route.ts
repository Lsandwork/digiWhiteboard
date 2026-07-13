import { marketingJson, requireMarketingAccess } from "@/lib/marketing/api";
import { getMarketingUserSettings, saveMarketingUserSettings } from "@/lib/marketing/settings";
import { getAdminUserById } from "@/lib/admin/users";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireMarketingAccess(request);
  if (gate.error) return gate.error;
  const userId = gate.actor!.session.adminUserId;
  if (!userId) return marketingJson({ error: "Managed account required." }, 403);
  try {
    const [settings, user] = await Promise.all([
      getMarketingUserSettings(gate.actor!.supabase, userId),
      getAdminUserById(gate.actor!.supabase, userId)
    ]);
    return marketingJson({
      settings,
      profile: {
        email: user?.email ?? gate.actor!.session.email,
        fullName: user?.full_name ?? null,
        avatarUrl: (user as { avatar_url?: string | null } | null)?.avatar_url ?? null
      }
    });
  } catch (error) {
    return marketingJson({ error: error instanceof Error ? error.message : "Unable to load settings." }, 500);
  }
}

export async function POST(request: Request) {
  const gate = await requireMarketingAccess(request);
  if (gate.error) return gate.error;
  const userId = gate.actor!.session.adminUserId;
  if (!userId) return marketingJson({ error: "Managed account required." }, 403);
  const body = (await request.json()) as Record<string, unknown>;
  try {
    const settings = await saveMarketingUserSettings(gate.actor!.supabase, userId, {
      default_destination: body.defaultDestination,
      default_upload_tags: body.defaultUploadTags,
      thumbnail_density: body.thumbnailDensity,
      notify_handler_updates: body.notifyHandlerUpdates,
      notify_upload_results: body.notifyUploadResults,
      notify_campaign_deadlines: body.notifyCampaignDeadlines
    });
    return marketingJson({ settings });
  } catch (error) {
    return marketingJson({ error: error instanceof Error ? error.message : "Unable to save settings." }, 500);
  }
}
