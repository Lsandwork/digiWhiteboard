import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { withTimeoutOrThrow } from "@/lib/server-ttl-cache";
import { getStateForToken } from "@/lib/remote-cast/server";
import { readReceiverToken } from "@/lib/remote-cast/api-guard";

export const dynamic = "force-dynamic";

const TIMEOUT_MS = 8_000;

export async function GET(request: Request) {
  const token = readReceiverToken(request);
  if (!token) {
    return NextResponse.json({ error: "Missing receiver token." }, { status: 401 });
  }
  try {
    const supabase = getServiceSupabase();
    const state = await withTimeoutOrThrow(getStateForToken(supabase, token), TIMEOUT_MS, "Receiver state");
    if (!state) {
      return NextResponse.json({ error: "Receiver not found.", unknownReceiver: true }, { status: 404 });
    }
    return NextResponse.json({ state }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load receiver state.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
