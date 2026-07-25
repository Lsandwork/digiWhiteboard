import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { fitdogWebhookSecret } from "@/lib/fitdog-ops/config";
import { ingestFitdogWebhookEvent } from "@/lib/fitdog-ops/sync";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 120;
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimit(key: string) {
  const now = Date.now();
  const current = hits.get(key);
  if (!current || current.resetAt < now) {
    hits.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  current.count += 1;
  return current.count <= RATE_LIMIT;
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function validateWebhookSecret(request: Request, rawBody: string) {
  const secret = fitdogWebhookSecret();
  if (!secret) return false;
  const header =
    request.headers.get("x-fitdog-signature") ||
    request.headers.get("x-fitdog-webhook-secret") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";
  if (!header) return false;
  if (safeEqual(header, secret)) return true;
  const digest = createHash("sha256").update(`${secret}.${rawBody}`).digest("hex");
  return safeEqual(header, digest) || safeEqual(header, `sha256=${digest}`);
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimit(ip)) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  const rawBody = await request.text();
  if (!validateWebhookSecret(request, rawBody)) {
    return NextResponse.json({ error: "Invalid Fitdog webhook signature." }, { status: 401 });
  }

  let payload: unknown = {};
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  // Acknowledge quickly; processing is bounded and idempotent.
  const supabase = getServiceSupabase();
  try {
    const result = await ingestFitdogWebhookEvent(supabase, payload);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
