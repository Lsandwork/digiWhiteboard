import { NextResponse } from "next/server";

function rawErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message ?? "").trim();
    if (message) return message;
  }
  return "";
}

export function isCastTvTimeoutError(error: unknown) {
  if (error instanceof Error && error.name === "AbortError") return true;
  return /aborted|AbortError|The operation was aborted|The user aborted a request/i.test(
    rawErrorMessage(error)
  );
}

export function castTvErrorMessage(error: unknown, fallback: string) {
  if (isCastTvTimeoutError(error)) {
    return "CAST-TV timed out waiting for the database. Try again in a moment.";
  }
  const message = rawErrorMessage(error);
  return message || fallback;
}

export function castTvErrorResponse(error: unknown, fallback: string) {
  const message = castTvErrorMessage(error, fallback);
  const timedOut = isCastTvTimeoutError(error) || message.includes("timed out");
  return NextResponse.json({ error: message }, { status: timedOut ? 504 : 400 });
}
