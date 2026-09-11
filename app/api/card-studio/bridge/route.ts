import { NextResponse } from "next/server";
import { createHmac } from "crypto";
import { getServiceSupabase } from "@/lib/supabase/server";
import { PRINT_BRIDGE_PROTOCOL_VERSION, verifyPrintBridgeToken } from "@/lib/card-studio/printers/bridge-protocol";

export const dynamic = "force-dynamic";

function bridgeSecret() {
  return process.env.CARD_STUDIO_PRINT_BRIDGE_SECRET || process.env.ADMIN_SESSION_SECRET || "";
}

export async function POST(request: Request) {
  const header = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const secret = bridgeSecret();
  if (!secret) {
    return NextResponse.json({ error: "Print Bridge is not configured." }, { status: 503 });
  }
  const payload = verifyPrintBridgeToken(header, secret);
  if (!payload) {
    return NextResponse.json({ error: "Print Bridge authentication failed." }, { status: 401 });
  }
  const supabase = getServiceSupabase();
  await supabase.from("card_studio_print_bridges").update({ last_seen_at: new Date().toISOString() }).eq("id", payload.bridgeId);
  const { data: jobs } = await supabase
    .from("card_studio_print_jobs")
    .select("id, job_id, status, printer_id, print_mode")
    .in("status", ["queued", "sending"])
    .limit(10);
  return NextResponse.json({
    ok: true,
    protocol: PRINT_BRIDGE_PROTOCOL_VERSION,
    bridgeId: payload.bridgeId,
    jobs: jobs ?? []
  });
}

export function signBridgeBody(body: string, secret: string) {
  return createHmac("sha256", secret).update(body).digest("hex");
}
