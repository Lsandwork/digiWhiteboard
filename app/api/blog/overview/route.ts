import { NextResponse } from "next/server";
import { blogActor, requireBlogPermission } from "@/lib/blog/api-auth";
import { getBlogOverview } from "@/lib/blog/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireBlogPermission(request, "blog.view");
  if (!auth.ok) return auth.response;
  try {
    const overview = await getBlogOverview();
    return NextResponse.json({ ok: true, overview, actor: blogActor(auth.session, auth.role) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load overview." },
      { status: 500 }
    );
  }
}
