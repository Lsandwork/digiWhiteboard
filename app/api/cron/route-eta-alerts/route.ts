import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { maybeAdvanceJasperDemoSms } from "@/lib/route-generator/jasper-demo-run";
import { processOwnerEtaAlerts } from "@/lib/route-generator/owner-tracking";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await processOwnerEtaAlerts();
    // Advance Jasper Lincoln→Redlands demo SMS (pulling-up texts) when Twilio is live.
    let jasperDemo: Record<string, unknown> | null = null;
    try {
      jasperDemo = await maybeAdvanceJasperDemoSms();
    } catch (error) {
      jasperDemo = {
        ok: false,
        error: error instanceof Error ? error.message : "jasper demo failed"
      };
    }
    return NextResponse.json({ ok: true, ...result, jasperDemo });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "ETA alert cron failed" },
      { status: 500 }
    );
  }
}
