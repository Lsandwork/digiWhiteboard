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
      .from("blog_subscribers")
      .select("id, email, status, source, consent_at, created_at, unsubscribed_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return NextResponse.json({ subscribers: data || [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load subscribers." },
      { status: 500 }
    );
  }
}
