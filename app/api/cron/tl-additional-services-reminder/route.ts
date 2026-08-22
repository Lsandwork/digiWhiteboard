import { NextResponse } from "next/server";
import { loadAdminSettingsJsonKey, saveAdminSettingsJsonKey } from "@/lib/admin/settings-json-store";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { getServiceSupabase, SERVICE_SUPABASE_CRON_TIMEOUT_MS } from "@/lib/supabase/server";
import {
  isTlServicesEmailSendSlot,
  parseTlServicesEmailState,
  sendTlServicesReminderEmail,
  TL_SERVICES_EMAIL_STATE_KEY,
  tlServicesEmailSlotKey
} from "@/lib/tl-digi-board/additional-services-email";
import { getTlDigiBoardSnapshot } from "@/lib/tl-digi-board/server";

export const dynamic = "force-dynamic";

/** Every 3 hours (6:30am–6:30pm Pacific) email contact@fitdog.com when TL services remain incomplete. */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const now = new Date();
  const slotKey = tlServicesEmailSlotKey(now);
  if (!slotKey) {
    return NextResponse.json({ ok: true, skipped: true, reason: "outside_send_slot" });
  }

  try {
    const supabase = getServiceSupabase({ timeoutMs: SERVICE_SUPABASE_CRON_TIMEOUT_MS });
    const emailState =
      (await loadAdminSettingsJsonKey(
        supabase,
        TL_SERVICES_EMAIL_STATE_KEY,
        parseTlServicesEmailState,
        { lastSlotKey: null, lastSentAt: null, lastServiceCount: 0 }
      )) ?? { lastSlotKey: null, lastSentAt: null, lastServiceCount: 0 };

    if (emailState.lastSlotKey === slotKey) {
      return NextResponse.json({ ok: true, skipped: true, reason: "already_sent_for_slot", slotKey });
    }

    const snapshot = await getTlDigiBoardSnapshot(supabase, { forceRefresh: true });
    const pending = snapshot.additionalServices.filter(
      (row) => row.displayStatus === "needs_completion"
    );

    if (!pending.length) {
      await saveAdminSettingsJsonKey(supabase, TL_SERVICES_EMAIL_STATE_KEY, {
        lastSlotKey: slotKey,
        lastSentAt: now.toISOString(),
        lastServiceCount: 0
      });
      return NextResponse.json({ ok: true, skipped: true, reason: "all_services_complete", slotKey });
    }

    const sendResult = await sendTlServicesReminderEmail(pending);
    if (!sendResult.ok) {
      return NextResponse.json(
        { ok: false, error: sendResult.error || "email_send_failed", slotKey, serviceCount: pending.length },
        { status: 500 }
      );
    }

    await saveAdminSettingsJsonKey(supabase, TL_SERVICES_EMAIL_STATE_KEY, {
      lastSlotKey: slotKey,
      lastSentAt: now.toISOString(),
      lastServiceCount: pending.length
    });

    return NextResponse.json({
      ok: true,
      sent: true,
      slotKey,
      serviceCount: pending.length,
      sendSlot: isTlServicesEmailSendSlot(now)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "TL services reminder cron failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
