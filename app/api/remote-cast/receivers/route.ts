import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { withTimeoutOrThrow } from "@/lib/server-ttl-cache";
import { listReceivers, removeReceiver } from "@/lib/remote-cast/server";
import { blockRemoteCastDemoWrite, requireRemoteCastAdmin } from "@/lib/remote-cast/api-guard";

export const dynamic = "force-dynamic";

const TIMEOUT_MS = 8_000;

export async function GET(request: Request) {
  const guard = requireRemoteCastAdmin(request);
  if (!guard.ok) return guard.response;

  try {
    const supabase = getServiceSupabase();
    const receivers = await withTimeoutOrThrow(listReceivers(supabase), TIMEOUT_MS, "List receivers");
    return NextResponse.json({ receivers }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load receivers.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const guard = requireRemoteCastAdmin(request);
  if (!guard.ok) return guard.response;
  const demo = blockRemoteCastDemoWrite(request);
  if (demo) return demo;

  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "Missing receiver id." }, { status: 400 });
  }

  try {
    const supabase = getServiceSupabase();
    const ok = await withTimeoutOrThrow(removeReceiver(supabase, id), TIMEOUT_MS, "Remove receiver");
    if (!ok) return NextResponse.json({ error: "Unable to remove display." }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to remove display.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
