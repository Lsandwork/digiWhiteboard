import { NextResponse } from "next/server";
import { requireCardStudioPermission } from "@/lib/card-studio/access";
import { lookupGingrRecord } from "@/lib/card-studio/members";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireCardStudioPermission(request, "card_studio.view");
  if (!auth.ok) return auth.response;
  const body = (await request.json()) as {
    gingrAnimalId?: string | null;
    gingrOwnerId?: string | null;
    live?: boolean;
  };
  try {
    const result = await lookupGingrRecord({
      gingrAnimalId: body.gingrAnimalId,
      gingrOwnerId: body.gingrOwnerId,
      live: Boolean(body.live)
    });
    return NextResponse.json({ ok: result.ok, lookup: result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gingr lookup failed." },
      { status: 500 }
    );
  }
}
