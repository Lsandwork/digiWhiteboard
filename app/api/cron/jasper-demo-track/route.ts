import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { maybeAdvanceJasperDemoSms } from "@/lib/route-generator/jasper-demo-run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Trigger / advance Jasper pickup demo SMS (Lincoln & Manchester → Redlands).
 * Auth: CRON_SECRET bearer or x-vercel-cron.
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

  const url = new URL(request.url);
  const to = url.searchParams.get("to") || "2139131391";
  const force = url.searchParams.get("force") === "1";

  try {
    const result = await maybeAdvanceJasperDemoSms({ to, force });
    return NextResponse.json(result, { status: result.ok === false ? 500 : 200 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Jasper demo failed" },
      { status: 500 }
    );
  }
}
