import { NextResponse } from "next/server";
import { releaseQueuedDailyReminders } from "@/lib/staff/daily-reminders";
import { loadActiveStaffPushNotice } from "@/lib/staff/push-notices";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = getServiceSupabase();
    await releaseQueuedDailyReminders(supabase);
    const activeNotice = await loadActiveStaffPushNotice(supabase);
    return NextResponse.json({ activeNotice, healthy: true });
  } catch {
    return NextResponse.json({ activeNotice: null, healthy: false });
  }
}
