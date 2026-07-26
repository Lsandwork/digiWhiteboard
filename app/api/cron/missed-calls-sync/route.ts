import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { syncMissedCallsFromGmail } from "@/lib/missed-calls/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const runtime = "nodejs";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== "production";
  const header = request.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const url = new URL(request.url);
  const q = url.searchParams.get("secret") || "";
  return bearer === secret || q === secret;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const supabase = getServiceSupabase();
    const result = await syncMissedCallsFromGmail({ supabase, trigger: "cron" });
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Missed calls cron failed." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
