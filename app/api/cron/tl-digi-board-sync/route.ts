import { NextResponse } from "next/server";
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

  try {
    const supabase = getServiceSupabase();
    const snapshot = await getTlDigiBoardSnapshot(supabase, { forceRefresh: true });
    return NextResponse.json({
      ok: true,
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
