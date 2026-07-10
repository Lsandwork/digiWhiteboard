import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { withTimeoutOrThrow } from "@/lib/server-ttl-cache";
import { pairReceiver } from "@/lib/remote-cast/server";
import { blockRemoteCastDemoWrite, requireRemoteCastAdmin } from "@/lib/remote-cast/api-guard";

export const dynamic = "force-dynamic";

const TIMEOUT_MS = 8_000;

export async function POST(request: Request) {
  const guard = requireRemoteCastAdmin(request);
  if (!guard.ok) return guard.response;
  const demo = blockRemoteCastDemoWrite(request);
  if (demo) return demo;

  try {
    const body = (await request.json().catch(() => ({}))) as { pairingCode?: string; displayName?: string };
    if (!body.pairingCode?.trim()) {
      return NextResponse.json({ error: "Enter a pairing code." }, { status: 400 });
    }
    const supabase = getServiceSupabase();
    const result = await withTimeoutOrThrow(
      pairReceiver(supabase, {
        pairingCode: body.pairingCode,
        displayName: body.displayName ?? null,
        createdBy: guard.actorEmail
      }),
      TIMEOUT_MS,
      "Pair receiver"
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? "Unable to pair display." }, { status: 400 });
    }
    return NextResponse.json({ ok: true, receiver: result.receiver });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to pair display.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
