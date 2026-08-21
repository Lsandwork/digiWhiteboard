import { NextResponse } from "next/server";
import { ensureRuffopsChecklistSchema } from "@/lib/ruffops-checklist/ensure-schema";
import { isCastDisplayOpenHours } from "@/lib/remote-cast/hours";
import { getServiceSupabase } from "@/lib/supabase/server";
import { getTlDigiBoardSnapshot } from "@/lib/tl-digi-board/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Centralized Gingr medication sync for TL Digi Board (~1 minute Vercel cron + on-demand TV polls). */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Overnight standby: skip Gingr + Supabase sync while TVs are off (5:30 AM–10:00 PM PT).
  if (!isCastDisplayOpenHours()) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "Cast display hours closed (standby overnight)."
    });
  }

  try {
    const supabase = getServiceSupabase({ timeoutMs: 20_000 });
    const schema = await ensureRuffopsChecklistSchema(supabase);
    const snapshot = await getTlDigiBoardSnapshot(supabase, { forceRefresh: true });
    return NextResponse.json({
      ok: true,
      checklistSchemaReady: schema.ready,
      generatedAt: snapshot.generatedAt,
      summary: snapshot.summary,
      servicesSummary: snapshot.servicesSummary,
      gingrSyncHealth: snapshot.meta.gingrSyncHealth,
      administrationStatusAvailable: snapshot.meta.administrationStatusAvailable,
      servicesCompletionStatusAvailable: snapshot.meta.servicesCompletionStatusAvailable,
      medicationCount: snapshot.medications.length,
      additionalServiceCount: snapshot.additionalServices.length,
      servicesCompletionAudit: snapshot.meta.servicesCompletionAudit
        ? {
            allRequiredTypesPass: snapshot.meta.servicesCompletionAudit.allRequiredTypesPass,
            perType: snapshot.meta.servicesCompletionAudit.perType.map((row) => ({
              serviceType: row.serviceType,
              status: row.status,
              scheduledToday: row.scheduledToday,
              unreliable: row.unreliable
            })),
            issues: snapshot.meta.servicesCompletionAudit.issues.slice(0, 5)
          }
        : null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "TL Digi Board cron sync failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
