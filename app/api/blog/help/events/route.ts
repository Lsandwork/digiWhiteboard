import { NextResponse } from "next/server";
import { blogActor, requireBlogPermission } from "@/lib/blog/api-auth";
import { writeBlogAudit } from "@/lib/blog/service";

export const dynamic = "force-dynamic";

const ALLOWED = new Set([
  "help.page_viewed",
  "help.tutorial_opened",
  "help.tutorial_setup_clicked",
  "help.open_blog_generator",
  "help.step_selected",
  "help.support_opened",
  "help.open_topics",
  "help.create_article",
  "help.open_needs_review",
  "help.open_calendar",
  "help.open_analytics",
  "help.feature_generator",
  "help.feature_seo",
  "help.feature_pipeline",
  "help.feature_analytics",
  "help.help_icon",
  "help.contextual_link"
]);

export async function POST(request: Request) {
  const auth = await requireBlogPermission(request, "blog.view");
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => ({}))) as { action?: string; details?: Record<string, unknown> };
  const action = typeof body.action === "string" ? body.action : "";
  if (!ALLOWED.has(action)) {
    return NextResponse.json({ error: "Unknown help event." }, { status: 400 });
  }

  const details = body.details && typeof body.details === "object" ? body.details : {};
  // Never persist free-form private content from the client.
  const safeDetails: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      safeDetails[key] = value;
    }
  }

  await writeBlogAudit(blogActor(auth.session, auth.role), action, "help", "blog-help-guide", safeDetails);
  return NextResponse.json({ ok: true });
}
