import { NextResponse } from "next/server";
import { requireCardStudioPermission } from "@/lib/card-studio/access";
import { searchCardStudioMembers } from "@/lib/card-studio/members";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireCardStudioPermission(request, "card_studio.view");
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const limit = Number(url.searchParams.get("limit") ?? 20);
  try {
    const members = await searchCardStudioMembers(q, limit);
    return NextResponse.json({ ok: true, members });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Member search failed." }, { status: 500 });
  }
}
