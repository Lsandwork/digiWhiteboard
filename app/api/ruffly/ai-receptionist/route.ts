import { NextResponse } from "next/server";
import { requireRufflyPermission } from "@/lib/ruffly/api-auth";
import { AI_DISCLOSURE, AI_FORBIDDEN_BEHAVIORS } from "@/lib/ruffly/ai/guardrails";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireRufflyPermission(request, "ruffly.ai.manage");
  if (!auth.ok) return auth.response;

  try {
    const supabase = getServiceSupabase();
    const { data: calls } = await supabase
      .from("ruffly_call_records")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    return NextResponse.json({
      disclosure: AI_DISCLOSURE,
      forbidden: AI_FORBIDDEN_BEHAVIORS,
      voiceConfigured: Boolean(process.env.RUFFLY_VOICE_PROVIDER?.trim()),
      calls: calls ?? [],
      note: "Direct Gingr booking is not claimed unless a tested write path exists."
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load AI receptionist.";
    if (message.includes("does not exist") || message.includes("schema cache")) {
      return NextResponse.json({
        disclosure: AI_DISCLOSURE,
        forbidden: AI_FORBIDDEN_BEHAVIORS,
        voiceConfigured: false,
        calls: [],
        warning: "Ruffly tables not migrated yet."
      });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
