import { NextResponse } from "next/server";
import { getOwnerSnapshotByToken } from "@/lib/live-tracking/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RATE = new Map<string, { count: number; reset: number }>();

function rateLimit(key: string, limit = 60, windowMs = 60_000) {
  const now = Date.now();
  const row = RATE.get(key);
  if (!row || now > row.reset) {
    RATE.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  row.count += 1;
  return row.count <= limit;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimit(`${ip}:${token.slice(0, 8)}`)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const result = await getOwnerSnapshotByToken(token);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      {
        status: result.status,
        headers: {
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
          "X-Robots-Tag": "noindex, nofollow, noarchive"
        }
      }
    );
  }

  return NextResponse.json(
    { snapshot: result.snapshot, isStaffPreview: result.isStaffPreview },
    { headers: result.headers }
  );
}
