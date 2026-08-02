import { NextResponse } from "next/server";
import { requireRufflyPermission } from "@/lib/ruffly/api-auth";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireRufflyPermission(request, "ruffly.webchat.manage");
  if (!auth.ok) return auth.response;

  const siteKey = process.env.RUFFLY_WEBCHAT_SITE_KEY?.trim() || "";
  const apiBase = (process.env.RUFFLY_API_BASE_URL?.trim() || "https://staff.ruffops.com").replace(/\/$/, "");
  const snippet = siteKey
    ? `<script src="${apiBase}/widget.js" async data-ruffly-key="${siteKey}" data-ruffly-api="${apiBase}"></script>`
    : `<script src="${apiBase}/widget.js" async data-ruffly-api="${apiBase}"></script>`;

  try {
    const supabase = getServiceSupabase();
    const { data: settings } = await supabase.from("ruffly_settings").select("webchat_config, webchat_enabled").eq("id", "default").maybeSingle();
    return NextResponse.json({
      enabled: Boolean(settings?.webchat_enabled),
      config: settings?.webchat_config ?? {},
      installSnippet: snippet,
      publicScriptUrl: `${apiBase}/widget.js`,
      embeddedOn: ["https://ruffly.ruffops.com/", "https://staff.ruffops.com/ruffly/public"],
      note: "Widget is embedded on the Ruffly public landing. Paste installSnippet on fitdog.com when that site owner is ready."
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load web chat settings.";
    if (message.includes("does not exist") || message.includes("schema cache")) {
      return NextResponse.json({
        enabled: false,
        config: {},
        installSnippet: snippet,
        warning: "Ruffly tables not migrated yet."
      });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
