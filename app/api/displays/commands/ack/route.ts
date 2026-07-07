import { NextResponse } from "next/server";
import { markDisplayCommandsDelivered } from "@/lib/display-keeper-server";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { commandIds?: string[] };
    const commandIds = Array.isArray(body.commandIds)
      ? body.commandIds.map((id) => String(id).trim()).filter(Boolean)
      : [];

    if (!commandIds.length) {
      return NextResponse.json({ ok: true });
    }

    await markDisplayCommandsDelivered(getServiceSupabase(), commandIds);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Unable to acknowledge commands." }, { status: 500 });
  }
}
