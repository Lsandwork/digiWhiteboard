import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { withTimeoutOrThrow } from "@/lib/server-ttl-cache";
import { registerReceiver } from "@/lib/remote-cast/server";

export const dynamic = "force-dynamic";

const TIMEOUT_MS = 8_000;

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { token?: string };
    const supabase = getServiceSupabase();
    const result = await withTimeoutOrThrow(
      registerReceiver(supabase, { existingToken: body.token ?? null }),
      TIMEOUT_MS,
      "Register receiver"
    );
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to register receiver.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
