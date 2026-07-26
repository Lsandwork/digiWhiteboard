import { NextResponse } from "next/server";
import { getOwnerTrackingPublic } from "@/lib/route-generator/owner-tracking";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!token || token.length < 8) {
    return NextResponse.json({ error: "Invalid tracking link." }, { status: 404 });
  }
  try {
    const view = await getOwnerTrackingPublic(token);
    if (!view) return NextResponse.json({ error: "Tracking link not found." }, { status: 404 });
    return NextResponse.json(view);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load tracking." },
      { status: 500 }
    );
  }
}
