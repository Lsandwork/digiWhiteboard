import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { processRufflyJobs } from "@/lib/ruffly/jobs/processor";
import { isRufflyEnabled } from "@/lib/ruffly/flags";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!isRufflyEnabled()) return NextResponse.json({ ok: true, skipped: true, reason: "RUFFLY_ENABLED=false" });

  try {
    const results = await processRufflyJobs(25);
    return NextResponse.json({ ok: true, processed: results.length, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Job worker failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
