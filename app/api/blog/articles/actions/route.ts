import { NextResponse } from "next/server";
import { blogActor, requireBlogPermission } from "@/lib/blog/api-auth";
import { publishBlogArticle, rescoreArticle, transitionArticleStatus, writeBlogAudit } from "@/lib/blog/service";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    articleId?: string;
    note?: string;
    patch?: Record<string, unknown>;
    scheduledFor?: string;
  };
  if (!body.articleId || !body.action) {
    return NextResponse.json({ error: "articleId and action are required." }, { status: 400 });
  }

  const actor = async (permission: Parameters<typeof requireBlogPermission>[1]) => {
    const auth = await requireBlogPermission(request, permission);
    if (!auth.ok) return { ok: false as const, response: auth.response };
    return { ok: true as const, actor: blogActor(auth.session, auth.role) };
  };

  try {
    switch (body.action) {
      case "approve": {
        const auth = await actor("blog.approve");
        if (!auth.ok) return auth.response;
        const article = await transitionArticleStatus(body.articleId, "APPROVED", auth.actor, body.note || "Approved");
        return NextResponse.json({ ok: true, article });
      }
      case "reject":
      case "request_changes": {
        const auth = await actor("blog.review");
        if (!auth.ok) return auth.response;
        const article = await transitionArticleStatus(
          body.articleId,
          "NEEDS_CHANGES",
          auth.actor,
          body.note || "Changes requested"
        );
        return NextResponse.json({ ok: true, article });
      }
      case "schedule": {
        const auth = await actor("blog.schedule");
        if (!auth.ok) return auth.response;
        if (!body.scheduledFor) return NextResponse.json({ error: "scheduledFor required." }, { status: 400 });
        const supabase = getServiceSupabase();
        await supabase
          .from("blog_articles")
          .update({
            scheduled_for: body.scheduledFor,
            status: "SCHEDULED",
            updated_at: new Date().toISOString()
          })
          .eq("id", body.articleId);
        await transitionArticleStatus(body.articleId, "SCHEDULED", auth.actor, `Scheduled for ${body.scheduledFor}`);
        return NextResponse.json({ ok: true });
      }
      case "publish": {
        const auth = await actor("blog.publish");
        if (!auth.ok) return auth.response;
        const article = await publishBlogArticle(body.articleId, auth.actor);
        return NextResponse.json({ ok: true, article });
      }
      case "archive": {
        const auth = await actor("blog.archive");
        if (!auth.ok) return auth.response;
        const article = await transitionArticleStatus(body.articleId, "ARCHIVED", auth.actor, body.note || "Archived");
        return NextResponse.json({ ok: true, article });
      }
      case "rescore": {
        const auth = await actor("blog.review");
        if (!auth.ok) return auth.response;
        const score = await rescoreArticle(body.articleId);
        return NextResponse.json({ ok: true, score });
      }
      case "save": {
        const auth = await actor("blog.edit");
        if (!auth.ok) return auth.response;
        const supabase = getServiceSupabase();
        const patch = body.patch || {};
        const allowed: Record<string, unknown> = {};
        for (const key of [
          "title",
          "subtitle",
          "slug",
          "excerpt",
          "body_html",
          "body_markdown",
          "seo_title",
          "meta_description",
          "canonical_url",
          "og_title",
          "og_description",
          "cover_alt",
          "cta_label",
          "cta_url",
          "author_profile",
          "primary_keyword",
          "robots"
        ]) {
          if (key in patch) allowed[key] = patch[key];
        }
        allowed.updated_at = new Date().toISOString();
        const { data, error } = await supabase
          .from("blog_articles")
          .update(allowed)
          .eq("id", body.articleId)
          .select("*")
          .single();
        if (error) throw error;
        await writeBlogAudit(auth.actor, "article.saved", "article", body.articleId, { keys: Object.keys(allowed) });
        return NextResponse.json({ ok: true, article: data });
      }
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Action failed." },
      { status: 500 }
    );
  }
}
