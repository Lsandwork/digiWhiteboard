import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { resolveSentryDsn } from "@/lib/sentry-dsn";

export const dynamic = "force-dynamic";

/**
 * Authenticated Sentry verification endpoint.
 * GET /api/sentry-test?token=$SENTRY_TEST_SECRET
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const expected = process.env.SENTRY_TEST_SECRET?.trim();
  const got = url.searchParams.get("token")?.trim();

  if (!expected || !got || got !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!resolveSentryDsn(false)) {
    return NextResponse.json(
      { error: "Sentry DSN not configured (set SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN)" },
      { status: 503 }
    );
  }

  try {
    // Classic Sentry docs trigger — intentional ReferenceError on the server runtime
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).myUndefinedFunction();
  } catch (error) {
    Sentry.captureException(error);
    await Sentry.flush(2000);
    return NextResponse.json({
      ok: true,
      message:
        "myUndefinedFunction() ReferenceError sent to Sentry. Check Issues within ~30s.",
      error: error instanceof Error ? error.message : String(error)
    });
  }

  return NextResponse.json({ error: "Expected ReferenceError was not thrown" }, { status: 500 });
}
