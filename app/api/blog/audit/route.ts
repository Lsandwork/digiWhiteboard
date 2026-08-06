import { NextResponse } from "next/server";
import { requireBlogPermission } from "@/lib/blog/api-auth";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireBlogPermission(request, "blog.view_audit_log");
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("blog_audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, logs: data || [] });
}
