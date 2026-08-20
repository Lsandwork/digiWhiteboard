import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { checkSmsCostThresholds } from "@/lib/integrations/sms/cost-alerts";
import { reconcileSmsCostEvents } from "@/lib/integrations/sms/reconcile";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Reconcile Twilio actual segment counts and evaluate daily cost thresholds. */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const reconcile = await reconcileSmsCostEvents();
    const alerts = await checkSmsCostThresholds();
    return NextResponse.json({ ok: true, reconcile, alerts });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "SMS cost reconcile failed" },
      { status: 500 }
    );
  }
}
