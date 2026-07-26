import { NextResponse } from "next/server";
import { requireRufflyPermission } from "@/lib/ruffly/api-auth";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireRufflyPermission(request, "ruffly.webchat.manage");
  if (!auth.ok) return auth.response;

  try {
    const supabase = getServiceSupabase();
    const { data: settings } = await supabase.from("ruffly_settings").select("webchat_config, webchat_enabled").eq("id", "default").maybeSingle();
    const snippet = `<script src="https://staff.ruffops.com/widget.js" async data-ruffly-key="PUBLIC_SITE_KEY" data-ruffly-api="https://staff.ruffops.com"></script>`;
    return NextResponse.json({
      enabled: Boolean(settings?.webchat_enabled),
      config: settings?.webchat_config ?? {},
      installSnippet: snippet,
      publicScriptUrl: "https://staff.ruffops.com/widget.js",
      note: "Use staff.ruffops.com/widget.js until ruffly.ruffops.com DNS is pointed at Vercel."
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load web chat settings.";
    if (message.includes("does not exist") || message.includes("schema cache")) {
      return NextResponse.json({
        enabled: false,
        config: {},
        installSnippet: `<script src="https://staff.ruffops.com/widget.js" async data-ruffly-api="https://staff.ruffops.com"></script>`,
        warning: "Ruffly tables not migrated yet."
      });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
