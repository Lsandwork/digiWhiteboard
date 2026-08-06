import { NextResponse } from "next/server";
import { blogActor, requireBlogPermission } from "@/lib/blog/api-auth";
import { generateArticleFromTopic } from "@/lib/blog/service";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  const auth = await requireBlogPermission(request, "blog.create");
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => ({}))) as { topicId?: string };
  if (!body.topicId) return NextResponse.json({ error: "topicId is required." }, { status: 400 });
  try {
    const article = await generateArticleFromTopic(body.topicId, blogActor(auth.session, auth.role));
    return NextResponse.json({ ok: true, article });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Generation failed." },
      { status: 500 }
    );
  }
}
