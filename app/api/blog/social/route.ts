import { NextResponse } from "next/server";
import { blogActor, requireBlogPermission } from "@/lib/blog/api-auth";
import {
  createSocialPack,
  downloadSocialPackCsv,
  downloadSocialPackTxt,
  getSocialPack,
  listSocialConnections,
  listSocialPacks,
  testSocialConnection,
  upsertSocialConnection
} from "@/lib/blog/social/service";
import { SOCIAL_PLATFORMS, type SocialPlatform } from "@/lib/blog/social/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireBlogPermission(request, "blog.view");
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const packId = url.searchParams.get("packId");
  const download = url.searchParams.get("download");
  const platform = url.searchParams.get("platform") as SocialPlatform | null;
  const format = url.searchParams.get("format");

  if (packId && (download === "csv" || download === "txt")) {
    try {
      const body =
        download === "txt"
          ? await downloadSocialPackTxt(packId, platform || undefined, format || undefined)
          : await downloadSocialPackCsv(packId, platform || undefined, format || undefined);
      const ext = download === "txt" ? "txt" : "csv";
      return new NextResponse(body, {
        headers: {
          "Content-Type": download === "txt" ? "text/plain; charset=utf-8" : "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="fitdog-social-${packId.slice(0, 8)}.${ext}"`
        }
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Download failed" },
        { status: 500 }
      );
    }
  }

  if (packId) {
    try {
      const data = await getSocialPack(packId);
      return NextResponse.json({ ok: true, ...data });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Pack not found" },
        { status: 404 }
      );
    }
  }

  const [packs, connections] = await Promise.all([listSocialPacks(30), listSocialConnections()]);
  return NextResponse.json({ ok: true, packs, connections });
}

export async function POST(request: Request) {
  const auth = await requireBlogPermission(request, "blog.create");
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action || "generate");

  if (action === "save_connection") {
    const pub = await requireBlogPermission(request, "blog.manage_publishing");
    if (!pub.ok) return pub.response;
    const platform = String(body.platform || "") as SocialPlatform;
    if (!SOCIAL_PLATFORMS.includes(platform)) {
      return NextResponse.json({ error: "Invalid platform." }, { status: 400 });
    }
    try {
      const row = await upsertSocialConnection({
        platform,
        username: body.username != null ? String(body.username) : undefined,
        secret: body.secret != null ? String(body.secret) : null,
        actor: blogActor(pub.session, pub.role)
      });
      return NextResponse.json({ ok: true, connection: { platform: row.platform, status: row.status } });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Unable to save connection." },
        { status: 500 }
      );
    }
  }

  if (action === "test_connection") {
    const pub = await requireBlogPermission(request, "blog.manage_publishing");
    if (!pub.ok) return pub.response;
    const platform = String(body.platform || "") as SocialPlatform;
    if (!SOCIAL_PLATFORMS.includes(platform)) {
      return NextResponse.json({ error: "Invalid platform." }, { status: 400 });
    }
    const result = await testSocialConnection(platform, blogActor(pub.session, pub.role));
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  try {
    const created = await createSocialPack({
      topic: body.topic != null ? String(body.topic) : null,
      angle: body.angle != null ? String(body.angle) : null,
      blogUrl: body.blogUrl != null ? String(body.blogUrl) : null,
      articleTitle: body.articleTitle != null ? String(body.articleTitle) : null,
      articleId: body.articleId != null ? String(body.articleId) : null,
      createdBy: blogActor(auth.session, auth.role),
      queueAutoPost: Boolean(body.queueAutoPost)
    });
    return NextResponse.json({ ok: true, ...created });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to generate social pack." },
      { status: 500 }
    );
  }
}
