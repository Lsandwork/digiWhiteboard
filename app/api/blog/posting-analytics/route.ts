import { NextResponse } from "next/server";
import { requireBlogPermission } from "@/lib/blog/api-auth";
import { getPostingAnalytics } from "@/lib/blog/posting-analytics";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireBlogPermission(request, "blog.view_analytics");
  if (!auth.ok) return auth.response;
  try {
    const data = await getPostingAnalytics();
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load posting analytics." },
      { status: 500 }
    );
  }
}
