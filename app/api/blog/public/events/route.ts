import { NextResponse } from "next/server";
import { writeBlogAudit } from "@/lib/blog/service";

export const dynamic = "force-dynamic";

/** Lightweight public interaction logging — never invents popularity metrics for display. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    type?: string;
    slug?: string;
    meta?: Record<string, unknown>;
  };
  const type = String(body.type || "").slice(0, 64);
  const slug = String(body.slug || "").slice(0, 120);
  if (!type || !slug) return NextResponse.json({ error: "type and slug required" }, { status: 400 });
  const meta =
    body.meta && typeof body.meta === "object"
      ? Object.fromEntries(
          Object.entries(body.meta)
            .slice(0, 12)
            .map(([k, v]) => [String(k).slice(0, 40), typeof v === "string" ? v.slice(0, 120) : v])
        )
      : {};
  await writeBlogAudit(null, `public.${type}`, "page", slug, meta);
  return NextResponse.json({ ok: true });
}
