import { NextResponse } from "next/server";
import { after } from "next/server";
import {
  getOwnerTrackingPublic,
  isOwnerTrackingDemoToken
} from "@/lib/route-generator/owner-tracking";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  // Real tokens are long base64url strings; demo tokens (`example`, `demo`) are short on purpose.
  if (!token || (!isOwnerTrackingDemoToken(token) && token.length < 8)) {
    return NextResponse.json({ error: "Invalid tracking link." }, { status: 404 });
  }
  try {
    const startedRaw = new URL(request.url).searchParams.get("t");
    const startedAtMs = startedRaw && /^\d{10,16}$/.test(startedRaw) ? Number(startedRaw) : null;
    const view = await getOwnerTrackingPublic(token, { startedAtMs });
    if (!view) return NextResponse.json({ error: "Tracking link not found." }, { status: 404 });

    // Jasper demo: advance Twilio SMS (start → approaching → pulling up → arrived) while the map is open.
    let jasperDemo: Record<string, unknown> | undefined;
    if (token.trim().toLowerCase() === "jasper") {
      const wantStatus = new URL(request.url).searchParams.get("sms") === "1";
      if (wantStatus) {
        try {
          const { maybeAdvanceJasperDemoSms } = await import("@/lib/route-generator/jasper-demo-run");
          jasperDemo = await maybeAdvanceJasperDemoSms();
        } catch (error) {
          jasperDemo = { ok: false, error: error instanceof Error ? error.message : "demo failed" };
        }
      } else {
        after(async () => {
          try {
            const { maybeAdvanceJasperDemoSms } = await import("@/lib/route-generator/jasper-demo-run");
            await maybeAdvanceJasperDemoSms();
          } catch (error) {
            console.error("jasper demo sms advance failed", error);
          }
        });
      }
    }

    return NextResponse.json(jasperDemo ? { ...view, jasperDemo } : view);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load tracking." },
      { status: 500 }
    );
  }
}
