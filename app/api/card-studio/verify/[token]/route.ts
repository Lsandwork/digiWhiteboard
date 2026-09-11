import { NextResponse } from "next/server";
import { publicVerify } from "@/lib/card-studio/store";
import { publicCardStatusLabel } from "@/lib/card-studio/verify";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const decoded = decodeURIComponent(token);
  const card = await publicVerify(decoded);
  if (!card) {
    return NextResponse.json({ ok: false, status: "UNKNOWN", message: "This card could not be verified." }, { status: 404 });
  }
  const label = publicCardStatusLabel(String(card.status), card.expiration_at);
  return NextResponse.json({
    ok: true,
    status: label,
    membershipType: card.membership_type ?? "Fitdog Member",
    cardNumber: card.card_number,
    expiration: card.expiration_at,
    issued: card.issued_at
  });
}
