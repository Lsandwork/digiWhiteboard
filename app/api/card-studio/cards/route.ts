import { NextResponse } from "next/server";
import { requireCardStudioPermission, cardStudioActor } from "@/lib/card-studio/access";
import { listIssuedCards, reprintCard, revokeCard } from "@/lib/card-studio/store";
import { writeCardStudioAudit } from "@/lib/card-studio/audit";
import { blockDemoWrite } from "@/lib/admin/api-auth";
import type { ReprintReason } from "@/lib/card-studio/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireCardStudioPermission(request, "card_studio.view");
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  try {
    const cards = await listIssuedCards({
      query: url.searchParams.get("q") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      limit: Number(url.searchParams.get("limit") ?? 25),
      offset: Number(url.searchParams.get("offset") ?? 0)
    });
    return NextResponse.json({ ok: true, cards });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load cards." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireCardStudioPermission(request, "card_studio.revoke");
  if (!auth.ok) return auth.response;
  const demo = blockDemoWrite(request);
  if (demo) return demo;
  const actor = cardStudioActor(auth.session, auth.role);
  const body = (await request.json()) as { id: string; action: "revoke" | "reprint"; reason?: ReprintReason; notes?: string; printerId?: string; overrideWarnings?: boolean };
  if (!body.id) return NextResponse.json({ error: "Card id is required." }, { status: 400 });
  try {
    if (body.action === "revoke") {
      await revokeCard(body.id, actor);
      await writeCardStudioAudit({
        actorAdminId: actor.adminUserId,
        actorEmail: actor.email,
        role: actor.role,
        action: "card.revoked",
        resourceType: "card",
        resourceId: body.id
      });
      return NextResponse.json({ ok: true });
    }
    if (body.action === "reprint") {
      if (!body.reason) return NextResponse.json({ error: "A reprint reason is required." }, { status: 400 });
      if (!body.printerId) return NextResponse.json({ error: "A printer is required." }, { status: 400 });
      const result = await reprintCard(
        { cardId: body.id, reason: body.reason, notes: body.notes, printerId: body.printerId, overrideWarnings: body.overrideWarnings },
        actor
      );
      await writeCardStudioAudit({
        actorAdminId: actor.adminUserId,
        actorEmail: actor.email,
        role: actor.role,
        action: "card.reprinted",
        resourceType: "card",
        resourceId: body.id,
        details: { reason: body.reason }
      });
      return NextResponse.json(result);
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Card action failed." }, { status: 500 });
  }
}
