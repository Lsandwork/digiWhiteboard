import { NextResponse } from "next/server";
import { requireBlogPermission } from "@/lib/blog/api-auth";
import { searchBlogDashboard } from "@/lib/blog/dashboard-data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireBlogPermission(request, "blog.view");
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  if (q.length < 2) {
    return NextResponse.json({ results: { articles: [], topics: [], categories: [], tags: [], authors: [] } });
  }
  if (q.length > 120) {
    return NextResponse.json({ error: "Query too long." }, { status: 400 });
  }

  try {
    const results = await searchBlogDashboard(q);
    return NextResponse.json({ results, q });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Search failed." },
      { status: 500 }
    );
  }
}
