import { NextResponse } from "next/server";
import { blogActor, requireBlogPermission } from "@/lib/blog/api-auth";
import { seedInitialPublishedArticles } from "@/lib/blog/content/seed-published";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireBlogPermission(request, "blog.publish");
  if (!auth.ok) return auth.response;
  try {
    const result = await seedInitialPublishedArticles(blogActor(auth.session, auth.role));
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Seed failed. Apply migrations 054 and 055 first." },
      { status: 500 }
    );
  }
}
