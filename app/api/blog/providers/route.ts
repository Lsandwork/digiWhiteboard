import { NextResponse } from "next/server";
import { requireBlogPermission } from "@/lib/blog/api-auth";
import { getBlogProviderStatus, testBlogProviderConnection, type BlogAiProviderName } from "@/lib/blog/ai/gateway";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireBlogPermission(request, "blog.manage_providers");
  if (!auth.ok) return auth.response;
  return NextResponse.json({
    ok: true,
    providers: getBlogProviderStatus(),
    note: "API keys are never returned. Configure them as server environment variables only."
  });
}

export async function POST(request: Request) {
  const auth = await requireBlogPermission(request, "blog.manage_providers");
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => ({}))) as { provider?: BlogAiProviderName };
  if (!body.provider) return NextResponse.json({ error: "provider is required." }, { status: 400 });
  const result = await testBlogProviderConnection(body.provider);
  return NextResponse.json({ ok: true, ...result });
}
