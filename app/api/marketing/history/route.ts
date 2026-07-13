import { marketingJson, requireMarketingAccess } from "@/lib/marketing/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireMarketingAccess(request);
  if (gate.error) return gate.error;
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 100);
  const { data, error } = await gate.actor!.supabase
    .from("marketing_activity_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return marketingJson({ error: error.message }, 500);
  return marketingJson({ entries: data ?? [] });
}
