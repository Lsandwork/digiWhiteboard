import { NextResponse } from "next/server";
import { requireRufflyPermission } from "@/lib/ruffly/api-auth";
import { isRufflyAutomationsEnabled } from "@/lib/ruffly/flags";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireRufflyPermission(request, "ruffly.automations.view");
  if (!auth.ok) return auth.response;
  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase.from("ruffly_automations").select("*").order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    return NextResponse.json({
      automations: data ?? [],
      enabled: isRufflyAutomationsEnabled(),
      note: isRufflyAutomationsEnabled()
        ? null
        : "Automations flag is off. Enable RUFFLY_AUTOMATIONS_ENABLED after provider tests."
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load automations.";
    // Tables may not exist until migration is applied
    if (message.includes("does not exist") || message.includes("schema cache")) {
      return NextResponse.json({
        automations: [],
        enabled: isRufflyAutomationsEnabled(),
        warning: "Ruffly tables not migrated yet. Run supabase migration 044_ruffly_core.sql."
      });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
