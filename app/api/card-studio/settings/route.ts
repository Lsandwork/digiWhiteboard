import { NextResponse } from "next/server";
import { requireCardStudioPermission, cardStudioActor } from "@/lib/card-studio/access";
import { loadCardStudioSettings, saveCardStudioSettings, listAuditEvents } from "@/lib/card-studio/store";
import { APPROVED_BRAND_ASSETS } from "@/lib/card-studio/settings";
import { writeCardStudioAudit } from "@/lib/card-studio/audit";
import { blockDemoWrite } from "@/lib/admin/api-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireCardStudioPermission(request, "card_studio.view");
  if (!auth.ok) return auth.response;
  const settings = await loadCardStudioSettings();
  const history = await listAuditEvents(40);
  return NextResponse.json({ ok: true, settings, assets: APPROVED_BRAND_ASSETS, history });
}

export async function PATCH(request: Request) {
  const auth = await requireCardStudioPermission(request, "card_studio.manage_settings");
  if (!auth.ok) return auth.response;
  const demo = blockDemoWrite(request);
  if (demo) return demo;
  const actor = cardStudioActor(auth.session, auth.role);
  const body = await request.json();
  const settings = await saveCardStudioSettings(body, actor);
  await writeCardStudioAudit({
    actorAdminId: actor.adminUserId,
    actorEmail: actor.email,
    role: actor.role,
    action: "settings.updated",
    resourceType: "settings",
    resourceId: "default"
  });
  return NextResponse.json({ ok: true, settings });
}
