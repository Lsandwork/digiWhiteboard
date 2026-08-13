import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { syncMyShiftFacilityFeed } from "@/lib/ops-command-center/my-shift-facility-feed";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const runtime = "nodejs";

/** Hourly 6am–7pm Pacific: refresh Gingr facility calendar + birthday feed for TL/coordinator My Shift. */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const force = new URL(request.url).searchParams.get("force") === "1";
    const result = await syncMyShiftFacilityFeed({ force });
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "My Shift facility feed cron failed."
      },
      { status: 500 }
    );
  }
}
