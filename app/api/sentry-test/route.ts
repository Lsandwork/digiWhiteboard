import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Temporary verification endpoint for Sentry first-error setup.
 * DELETE after confirming an issue appears in Sentry.
 *
 * GET /api/sentry-test?token=$SENTRY_TEST_SECRET
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

  const err = new Error("Sentry test error — delete /api/sentry-test after verification");
  Sentry.captureException(err);
  await Sentry.flush(2000);

  return NextResponse.json({
    ok: true,
    message: "Test exception sent to Sentry. Check Issues within ~30s, then delete this route."
  });
}
