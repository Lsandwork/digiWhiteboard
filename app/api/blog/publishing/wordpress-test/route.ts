import { NextResponse } from "next/server";
import { blogActor, requireBlogPermission } from "@/lib/blog/api-auth";
import { testWordPressConnection } from "@/lib/blog/publishing/wordpress-mirror";
import { writeBlogAudit } from "@/lib/blog/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireBlogPermission(request, "blog.manage_publishing");
  if (!auth.ok) return auth.response;
  const result = await testWordPressConnection();
  await writeBlogAudit(blogActor(auth.session, auth.role), "publishing.wordpress_test", "settings", "default", result);
  return NextResponse.json(
    { ok: result.ok, message: result.message, detail: result.detail },
    { status: result.ok ? 200 : 400 }
  );
}
