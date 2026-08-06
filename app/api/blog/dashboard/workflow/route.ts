import { NextResponse } from "next/server";
import { blogActor, requireBlogPermission } from "@/lib/blog/api-auth";
import { createManualDraftArticle, getBlogSettings, transitionArticleStatus, writeBlogAudit } from "@/lib/blog/service";
import { planPipelineTransition, type PipelineColumn } from "@/lib/blog/workflow";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Body = {
  action?: "pipeline_move" | "create_draft";
  kind?: "article" | "topic";
  id?: string;
  fromColumn?: PipelineColumn;
  toColumn?: PipelineColumn;
  scheduledFor?: string;
  title?: string;
  confirm?: boolean;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Body;

  if (body.action === "create_draft") {
    const auth = await requireBlogPermission(request, "blog.create");
    if (!auth.ok) return auth.response;
    try {
      const article = await createManualDraftArticle({
        title: body.title,
        createdBy: blogActor(auth.session, auth.role)
      });
      return NextResponse.json({ ok: true, article });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Could not create draft." },
        { status: 500 }
      );
    }
  }

  if (body.action !== "pipeline_move") {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  if (!body.id || !body.kind || !body.fromColumn || !body.toColumn) {
    return NextResponse.json({ error: "id, kind, fromColumn, and toColumn are required." }, { status: 400 });
  }

  const supabase = getServiceSupabase();
  const settings = await getBlogSettings();

  let factCheckStatus: string | null = null;
  let humanEditorialScore: number | null = null;

  if (body.kind === "article") {
    const { data: article, error } = await supabase
      .from("blog_articles")
      .select("id, status, fact_check_status, human_editorial_score")
      .eq("id", body.id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!article) return NextResponse.json({ error: "Article not found." }, { status: 404 });
    factCheckStatus = article.fact_check_status ? String(article.fact_check_status) : null;
    humanEditorialScore = article.human_editorial_score != null ? Number(article.human_editorial_score) : null;
  } else {
    const { data: topic, error } = await supabase.from("blog_topics").select("id, status").eq("id", body.id).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!topic) return NextResponse.json({ error: "Topic not found." }, { status: 404 });
  }

  const plan = planPipelineTransition({
    kind: body.kind,
    id: body.id,
    fromColumn: body.fromColumn,
    toColumn: body.toColumn,
    scheduledFor: body.scheduledFor,
    factCheckStatus,
    humanEditorialScore,
    humanScoreThreshold: Number(settings.human_score_threshold || 90)
  });

  if (!plan.ok) {
    return NextResponse.json({ error: plan.error }, { status: 400 });
  }

  const auth = await requireBlogPermission(request, plan.permission);
  if (!auth.ok) return auth.response;
  const actor = blogActor(auth.session, auth.role);

  if (plan.requiresConfirm && !body.confirm) {
    return NextResponse.json({
      ok: false,
      requiresConfirm: true,
      message: plan.message || "Confirm this workflow change.",
      action: plan.action
    });
  }

  try {
    if (plan.action === "generate_from_topic") {
      return NextResponse.json({
        ok: true,
        redirect: `/admin/automatic-blog?page=generate&topicId=${body.id}`,
        message: "Open Blog Generator to create a draft from this topic."
      });
    }

    if (plan.action === "schedule") {
      await supabase
        .from("blog_articles")
        .update({
          scheduled_for: body.scheduledFor,
          status: "SCHEDULED",
          updated_at: new Date().toISOString()
        })
        .eq("id", body.id);
      await transitionArticleStatus(body.id, "SCHEDULED", actor, `Scheduled for ${body.scheduledFor}`);
      return NextResponse.json({ ok: true });
    }

    if (plan.action === "unschedule_to_approved") {
      await supabase
        .from("blog_articles")
        .update({
          scheduled_for: null,
          status: "APPROVED",
          updated_at: new Date().toISOString()
        })
        .eq("id", body.id);
      await transitionArticleStatus(body.id, "APPROVED", actor, "Unscheduled back to Approved");
      return NextResponse.json({ ok: true });
    }

    if (plan.targetStatus) {
      await transitionArticleStatus(body.id, plan.targetStatus, actor, plan.message || plan.action);
      await writeBlogAudit(actor, `pipeline.${plan.action}`, "article", body.id, {
        fromColumn: body.fromColumn,
        toColumn: body.toColumn
      });
      return NextResponse.json({ ok: true, status: plan.targetStatus });
    }

    return NextResponse.json({ error: "Unhandled workflow action." }, { status: 500 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Workflow update failed." },
      { status: 500 }
    );
  }
}
