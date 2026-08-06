import { NextResponse } from "next/server";
import { requireBlogPermission } from "@/lib/blog/api-auth";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireBlogPermission(request, "blog.view");
  if (!auth.ok) return auth.response;

  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("blog_promotions")
      .select(
        "id, title, subtitle, cta_label, cta_url, terms, eligibility, active, approved, starts_at, ends_at, updated_at"
      )
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return NextResponse.json({ promotions: data || [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load promotions." },
      { status: 500 }
    );
  }
}
