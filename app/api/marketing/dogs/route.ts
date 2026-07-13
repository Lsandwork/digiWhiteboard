import { marketingJson, requireMarketingAccess } from "@/lib/marketing/api";
import { loadAdminSettings } from "@/lib/admin/settings";
import { loadActiveDogsForGroomingPush } from "@/lib/grooming-push-active-dogs";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireMarketingAccess(request);
  if (gate.error) return gate.error;
  try {
    const settings = await loadAdminSettings(gate.actor!.supabase);
    const result = await loadActiveDogsForGroomingPush(gate.actor!.supabase, { timeZone: settings.timezone });
    return marketingJson({ dogs: result.dogs, meta: result.meta });
  } catch (error) {
    return marketingJson({ error: error instanceof Error ? error.message : "Unable to load dogs." }, 500);
  }
}
