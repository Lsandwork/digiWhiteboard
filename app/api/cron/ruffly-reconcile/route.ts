import { NextResponse } from "next/server";
import { runGingrContactReconciliation } from "@/lib/integrations/gingr/sync/reconcile";
import { isRufflyEnabled } from "@/lib/ruffly/flags";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret) {
    const auth = request.headers.get("authorization")?.trim();
    if (auth === `Bearer ${cronSecret}`) return true;
  }
  return request.headers.get("x-vercel-cron") === "1";
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!isRufflyEnabled()) return NextResponse.json({ ok: true, skipped: true, reason: "RUFFLY_ENABLED=false" });

  try {
    const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const result = await runGingrContactReconciliation({ modifiedSince: since, limit: 200 });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reconcile failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
