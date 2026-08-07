import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { processOwnerEtaAlerts } from "@/lib/route-generator/owner-tracking";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await processOwnerEtaAlerts();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "ETA alert cron failed" },
      { status: 500 }
    );
  }
}
