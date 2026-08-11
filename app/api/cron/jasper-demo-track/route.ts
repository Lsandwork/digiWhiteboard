import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import {
  isJasperDemoSmsEnabled,
  maybeAdvanceJasperDemoSms
} from "@/lib/route-generator/jasper-demo-run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Manual / intentional Jasper demo only.
 * Requires JASPER_DEMO_SMS_ENABLED=true on the deployment.
 * Not scheduled in vercel.json — must never be auto-wired to production crons.
 *
 * GET/POST /api/cron/jasper-demo-track?to=2139131391&force=1
 */
export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}

async function run(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!isJasperDemoSmsEnabled()) {
    return NextResponse.json(
      {
        ok: false,
        skipped: true,
        reason: "jasper_demo_sms_disabled",
        error:
          "Jasper demo SMS is disabled. Set JASPER_DEMO_SMS_ENABLED=true only for a controlled staff demo, then unset it."
      },
      { status: 403 }
    );
  }

  const url = new URL(request.url);
  const to = url.searchParams.get("to") || "2139131391";
  const force = url.searchParams.get("force") === "1";

  try {
    const result = await maybeAdvanceJasperDemoSms({ to, force });
    const failed = result.ok === false || Boolean(result.error);
    return NextResponse.json(result, { status: failed ? 500 : 200 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Jasper demo failed" },
      { status: 500 }
    );
  }
}
