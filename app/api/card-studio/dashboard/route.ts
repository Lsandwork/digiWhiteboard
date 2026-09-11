import { NextResponse } from "next/server";
import { requireCardStudioPermission, cardStudioActor } from "@/lib/card-studio/access";
import { dashboardStats, ensureDefaultTemplates, refreshDiscoveredPrinters } from "@/lib/card-studio/store";
import { writeCardStudioAudit } from "@/lib/card-studio/audit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireCardStudioPermission(request, "card_studio.view");
  if (!auth.ok) return auth.response;
  const actor = cardStudioActor(auth.session, auth.role);
  await ensureDefaultTemplates(actor);
  try {
    await refreshDiscoveredPrinters();
  } catch {
    // Simulator discovery is best-effort.
  }
  try {
    const stats = await dashboardStats();
    return NextResponse.json({ ok: true, stats });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Dashboard failed." }, { status: 500 });
  }
}
