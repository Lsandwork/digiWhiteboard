import { NextResponse } from "next/server";
import { blogActor, requireBlogPermission } from "@/lib/blog/api-auth";
import { writeBlogAudit } from "@/lib/blog/service";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireBlogPermission(request, "blog.manage_knowledge");
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("blog_knowledge_entries")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, entries: data || [] });
}

export async function POST(request: Request) {
  const auth = await requireBlogPermission(request, "blog.manage_knowledge");
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("blog_knowledge_entries")
    .insert({
      title: String(body.title || "").trim(),
      category: String(body.category || "general"),
      approved_statement: String(body.approvedStatement || body.approved_statement || "").trim(),
      approved_by: blogActor(auth.session, auth.role),
      approved_at: new Date().toISOString(),
      public_use_allowed: Boolean(body.publicUseAllowed),
      internal_notes: String(body.internalNotes || ""),
      status: "active"
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await writeBlogAudit(blogActor(auth.session, auth.role), "knowledge.created", "knowledge", String(data.id));
  return NextResponse.json({ ok: true, entry: data });
}
