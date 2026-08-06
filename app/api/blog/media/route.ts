import { NextResponse } from "next/server";
import { blogActor, requireBlogPermission } from "@/lib/blog/api-auth";
import { writeBlogAudit } from "@/lib/blog/service";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireBlogPermission(request, "blog.manage_media");
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  const { searchParams } = new URL(request.url);
  const approval = searchParams.get("approval");
  let query = supabase.from("blog_media_assets").select("*").order("created_at", { ascending: false }).limit(200);
  if (approval) query = query.eq("approval_status", approval);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, media: data || [] });
}

export async function POST(request: Request) {
  const auth = await requireBlogPermission(request, "blog.manage_media");
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const sourceClass = String(body.sourceClass || "fitdog_owned");
  if (sourceClass === "ai_generated_approved") {
    return NextResponse.json(
      { error: "AI-generated images require Super Admin enablement and manual approval workflow." },
      { status: 400 }
    );
  }
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("blog_media_assets")
    .insert({
      public_url: body.publicUrl ? String(body.publicUrl) : null,
      storage_path: body.storagePath ? String(body.storagePath) : null,
      source_class: sourceClass,
      photographer: body.photographer ? String(body.photographer) : null,
      license_notes: String(body.licenseNotes || ""),
      usage_restrictions: String(body.usageRestrictions || ""),
      uploaded_by: blogActor(auth.session, auth.role),
      approval_status: "pending",
      alt_text: String(body.altText || ""),
      caption: String(body.caption || ""),
      tags: Array.isArray(body.tags) ? body.tags : [],
      activity: body.activity ? String(body.activity) : null,
      orientation: body.orientation ? String(body.orientation) : null,
      season: body.season ? String(body.season) : null
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await writeBlogAudit(blogActor(auth.session, auth.role), "media.created", "media", String(data.id));
  return NextResponse.json({ ok: true, media: data });
}

export async function PATCH(request: Request) {
  const auth = await requireBlogPermission(request, "blog.approve_images");
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    approvalStatus?: "approved" | "rejected";
    syntheticFlags?: string[];
    note?: string;
  };
  if (!body.id || !body.approvalStatus) {
    return NextResponse.json({ error: "id and approvalStatus required." }, { status: 400 });
  }
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("blog_media_assets")
    .update({
      approval_status: body.approvalStatus,
      synthetic_flags: body.syntheticFlags || [],
      updated_at: new Date().toISOString()
    })
    .eq("id", body.id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await writeBlogAudit(blogActor(auth.session, auth.role), "media.approval", "media", body.id, {
    status: body.approvalStatus,
    note: body.note
  });
  return NextResponse.json({ ok: true, media: data });
}
