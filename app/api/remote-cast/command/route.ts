import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { withTimeoutOrThrow } from "@/lib/server-ttl-cache";
import { issueCommand } from "@/lib/remote-cast/server";
import { isRemoteCastCommand, isRemoteCastScreen } from "@/lib/remote-cast/types";
import { blockRemoteCastDemoWrite, requireRemoteCastAdmin } from "@/lib/remote-cast/api-guard";

export const dynamic = "force-dynamic";

const TIMEOUT_MS = 8_000;

export async function POST(request: Request) {
  const guard = requireRemoteCastAdmin(request);
  if (!guard.ok) return guard.response;
  const demo = blockRemoteCastDemoWrite(request);
  if (demo) return demo;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      receiverId?: string;
      command?: string;
      screen?: string;
      displayName?: string;
    };

    if (!body.receiverId?.trim()) {
      return NextResponse.json({ error: "Missing receiver id." }, { status: 400 });
    }
    if (!isRemoteCastCommand(body.command)) {
      return NextResponse.json({ error: "Unsupported command." }, { status: 400 });
    }

    const supabase = getServiceSupabase();
    const result = await withTimeoutOrThrow(
      issueCommand(supabase, {
        receiverId: body.receiverId,
        command: body.command,
        screen: isRemoteCastScreen(body.screen) ? body.screen : null,
        displayName: body.displayName ?? null,
        createdBy: guard.actorEmail
      }),
      TIMEOUT_MS,
      "Send command"
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? "Unable to send command." }, { status: 400 });
    }
    return NextResponse.json({ ok: true, receiver: result.receiver });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to send command.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
