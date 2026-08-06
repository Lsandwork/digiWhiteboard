import { NextResponse } from "next/server";
import { writeBlogAudit } from "@/lib/blog/service";

export const dynamic = "force-dynamic";

/** Lightweight public interaction logging — never invents popularity metrics for display. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { type?: string; slug?: string };
  const type = String(body.type || "").slice(0, 40);
  const slug = String(body.slug || "").slice(0, 120);
  if (!type || !slug) return NextResponse.json({ error: "type and slug required" }, { status: 400 });
  await writeBlogAudit(null, `public.${type}`, "article", slug, {});
  return NextResponse.json({ ok: true });
}
