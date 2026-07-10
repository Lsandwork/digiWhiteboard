import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { withTimeoutOrThrow } from "@/lib/server-ttl-cache";
import { recordHeartbeat } from "@/lib/remote-cast/server";
import { readReceiverToken } from "@/lib/remote-cast/api-guard";

export const dynamic = "force-dynamic";

const TIMEOUT_MS = 8_000;

export async function POST(request: Request) {
  const token = readReceiverToken(request);
  if (!token) {
    return NextResponse.json({ error: "Missing receiver token." }, { status: 401 });
  }
  try {
    const body = (await request.json().catch(() => ({}))) as { activeScreen?: string };
    const supabase = getServiceSupabase();
    const result = await withTimeoutOrThrow(
      recordHeartbeat(supabase, token, body.activeScreen),
      TIMEOUT_MS,
      "Receiver heartbeat"
    );
    if (!result.ok) {
      return NextResponse.json({ error: "Receiver not found.", unknownReceiver: true }, { status: 404 });
    }
    return NextResponse.json({ ok: true, state: result.state }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to record heartbeat.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
