import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Temporary verification endpoint for Sentry first-error setup.
 * DELETE after confirming an issue appears in Sentry.
 *
 * GET /api/sentry-test?token=$SENTRY_TEST_SECRET
 * Also try the client page: /sentry-example-page (calls myUndefinedFunction()).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const expected = process.env.SENTRY_TEST_SECRET?.trim();
  const got = url.searchParams.get("token")?.trim();

  if (!expected || !got || got !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.SENTRY_DSN && !process.env.NEXT_PUBLIC_SENTRY_DSN) {
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
        "myUndefinedFunction() ReferenceError sent to Sentry. Check Issues within ~30s, then delete this route and /sentry-example-page.",
      error: error instanceof Error ? error.message : String(error)
    });
  }

  return NextResponse.json({ error: "Expected ReferenceError was not thrown" }, { status: 500 });
}
