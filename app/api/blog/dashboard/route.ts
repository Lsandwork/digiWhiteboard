import { NextResponse } from "next/server";
import { requireBlogPermission } from "@/lib/blog/api-auth";
import { getBlogDashboardData, type DashboardRange } from "@/lib/blog/dashboard-data";

export const dynamic = "force-dynamic";

function parseRange(value: string | null): DashboardRange {
  if (value === "7d" || value === "90d" || value === "year") return value;
  return "30d";
}

export async function GET(request: Request) {
  const auth = await requireBlogPermission(request, "blog.view");
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const range = parseRange(url.searchParams.get("range"));

  try {
    const dashboard = await getBlogDashboardData(range);
    return NextResponse.json({ dashboard });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load blog dashboard." },
      { status: 500 }
    );
  }
}
