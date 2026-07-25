import { NextResponse } from "next/server";
import { runFitdogSync } from "@/lib/fitdog-ops/sync";
import { getFitdogIntegrationSettings } from "@/lib/fitdog-ops/store";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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

  const supabase = getServiceSupabase();
  const settings = await getFitdogIntegrationSettings(supabase);
  const url = new URL(request.url);
  const modeParam = url.searchParams.get("mode");

  let mode: "incremental" | "backfill" | "reconciliation" = "incremental";
  if (modeParam === "backfill" || modeParam === "reconciliation") {
    mode = modeParam;
  } else {
    // Nightly window (approx 2–4 AM Pacific ≈ 9–12 UTC): reconciliation.
    const hourUtc = new Date().getUTCHours();
    if (hourUtc === 10) mode = "reconciliation";
    if (!settings.last_backfill_at) mode = "backfill";
  }

  const run = await runFitdogSync(supabase, {
    trigger: mode === "backfill" ? "backfill" : mode === "reconciliation" ? "reconciliation" : "cron",
    mode
  });

  return NextResponse.json({ ok: true, run });
}
