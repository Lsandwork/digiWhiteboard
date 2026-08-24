import { NextResponse } from "next/server";
import { loadCastHardReloadNonce } from "@/lib/display-sync-server";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 10;

const NO_STORE = {
  "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
  pragma: "no-cache"
};

export async function GET() {
  try {
    const nonce = await loadCastHardReloadNonce(getServiceSupabase());
    return NextResponse.json({ nonce }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ nonce: 0 }, { headers: NO_STORE });
  }
}
