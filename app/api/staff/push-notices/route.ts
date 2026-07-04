import { NextResponse } from "next/server";
import { loadActiveStaffPushNotice } from "@/lib/staff/push-notices";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const activeNotice = await loadActiveStaffPushNotice(getServiceSupabase());
    return NextResponse.json({ activeNotice, healthy: true });
  } catch {
    return NextResponse.json({ activeNotice: null, healthy: false });
  }
}
