import { NextResponse } from "next/server";
import { verifyAdminPassword } from "@/lib/admin/auth";
import { checkLoginRateLimit, clearLoginAttempts, recordFailedLogin } from "@/lib/admin/rate-limit";
import {
  ADMIN_SESSION_COOKIE,
  createAdminSessionToken,
  getAdminSessionCookieOptions
} from "@/lib/admin/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { username?: string; password?: string };
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");

    const clientKey =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const rateLimit = checkLoginRateLimit(`${clientKey}:${username.toLowerCase()}`);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Invalid username or password." },
        { status: 429 }
      );
    }

    if (!username || !password) {
      return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
    }

    const valid = await verifyAdminPassword(username, password);
    if (!valid) {
      recordFailedLogin(`${clientKey}:${username.toLowerCase()}`);
      return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
    }

    clearLoginAttempts(`${clientKey}:${username.toLowerCase()}`);
    const token = createAdminSessionToken(username);
    const response = NextResponse.json({ ok: true, username });
    response.cookies.set(ADMIN_SESSION_COOKIE, token, getAdminSessionCookieOptions());
    return response;
  } catch {
    return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
  }
}
