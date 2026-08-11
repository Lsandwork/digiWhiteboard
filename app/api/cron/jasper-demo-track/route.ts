import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

/**
 * Permanently retired. Jasper demo SMS caused owner texts at 9:08pm (and mornings).
 * Real owner alerts: `/api/cron/route-eta-alerts` → `processOwnerEtaAlerts` only.
 */
export async function GET(request: Request) {
  return retired(request);
}

export async function POST(request: Request) {
  return retired(request);
}

async function retired(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  return NextResponse.json(
    {
      ok: false,
      skipped: true,
      reason: "jasper_demo_sms_permanently_disabled",
      error:
        "Jasper demo SMS is permanently disabled. It previously sent “departing at 9:08pm” outside real owner SMS policy."
    },
    { status: 410 }
  );
}
