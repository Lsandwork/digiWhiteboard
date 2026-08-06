import { NextResponse } from "next/server";
import { packProSyncEnabled } from "@/lib/pack-pro/config";
import { runPackProTrainingSync } from "@/lib/pack-pro/sync";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const runtime = "nodejs";

function isAuthorizedCron(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret) {
    const auth = request.headers.get("authorization")?.trim();
    if (auth === `Bearer ${cronSecret}`) return true;
  }
  return request.headers.get("x-vercel-cron") === "1";
}

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!packProSyncEnabled()) {
    return NextResponse.json({ skipped: true, reason: "disabled" });
  }

  const supabase = getServiceSupabase();
  const result = await runPackProTrainingSync(supabase, {
    trigger: "cron",
    actor: "pack-pro-cron",
    force: true
  });
  return NextResponse.json(result);
}
