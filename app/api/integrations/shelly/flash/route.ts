import { NextResponse } from "next/server";
import { canManagePushNotices, isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import {
  clearShellyAlert,
  isShellyAlertConfigured,
  triggerShellyAlert,
  validateShellyFlashRequest
} from "@/lib/shelly-alert";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const session = getAdminSessionFromRequest(request);
  if (!canManagePushNotices(session?.role)) {
    return NextResponse.json({ error: "You do not have permission to test the alert light." }, { status: 403 });
  }

  let body: { action?: unknown; type?: unknown; eventKey?: unknown; reason?: unknown };
  try {
    body = (await request.json()) as {
      action?: unknown;
      type?: unknown;
      eventKey?: unknown;
      reason?: unknown;
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!isShellyAlertConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: "Shelly alert light is disabled or missing server configuration."
      },
      { status: 503 }
    );
  }

  if (body.action === "clear") {
    const reason =
      typeof body.reason === "string" && body.reason.trim()
        ? body.reason.trim().slice(0, 120)
        : "manual_user_clear";
    const result = await clearShellyAlert(reason);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error ?? "Unable to clear the alert light." },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true, action: "clear" });
  }

  const parsed = validateShellyFlashRequest(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const result = await triggerShellyAlert(parsed.type, parsed.eventKey);
  if (!result.ok) {
    const status = result.skipped === "duplicate" || result.skipped === "rate_limited" ? 409 : 502;
    return NextResponse.json(
      {
        ok: false,
        skipped: result.skipped ?? null,
        error: result.error ?? "Shelly alert request failed."
      },
      { status }
    );
  }

  return NextResponse.json({
    ok: true,
    type: parsed.type,
    eventKey: parsed.eventKey
  });
}
