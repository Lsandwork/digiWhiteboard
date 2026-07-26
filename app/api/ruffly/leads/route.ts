import { NextResponse } from "next/server";
import { requireRufflyPermission } from "@/lib/ruffly/api-auth";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireRufflyPermission(request, "ruffly.leads.view");
  if (!auth.ok) return auth.response;
  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase.from("ruffly_leads").select("*").order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    return NextResponse.json({ leads: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load leads.";
    // Tables may not exist until migration is applied
    if (message.includes("does not exist") || message.includes("schema cache")) {
      return NextResponse.json({ leads: [], warning: "Ruffly tables not migrated yet. Run supabase migration 044_ruffly_core.sql." });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
