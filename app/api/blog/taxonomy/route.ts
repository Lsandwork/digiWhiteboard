import { NextResponse } from "next/server";
import { requireBlogPermission } from "@/lib/blog/api-auth";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireBlogPermission(request, "blog.view");
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "categories";
  const supabase = getServiceSupabase();

  try {
    if (type === "tags") {
      const { data, error } = await supabase.from("blog_tags").select("id, slug, label, created_at").order("label");
      if (error) throw error;
      return NextResponse.json({ items: data || [] });
    }
    if (type === "authors") {
      const { data, error } = await supabase
        .from("blog_authors")
        .select("id, name, slug, bio, public_profile, created_at")
        .order("name");
      if (error) throw error;
      return NextResponse.json({ items: data || [] });
    }
    const { data, error } = await supabase
      .from("blog_categories")
      .select("id, slug, label, description, active, sort_order")
      .order("sort_order");
    if (error) throw error;
    return NextResponse.json({ items: data || [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load taxonomy." },
      { status: 500 }
    );
  }
}
