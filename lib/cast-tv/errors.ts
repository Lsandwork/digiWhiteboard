import { NextResponse } from "next/server";

export function castTvErrorMessage(error: unknown, fallback: string) {
  if (
    error instanceof Error &&
    (error.name === "AbortError" || /aborted|The operation was aborted/i.test(error.message))
  ) {
    return "CAST-TV storage timed out. Try again in a moment.";
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

export function castTvErrorResponse(error: unknown, fallback: string) {
  const message = castTvErrorMessage(error, fallback);
  const timedOut = message.includes("timed out");
  return NextResponse.json({ error: message }, { status: timedOut ? 504 : 400 });
}
