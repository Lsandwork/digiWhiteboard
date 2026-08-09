import { NextResponse } from "next/server";
import { requireBlogPermission } from "@/lib/blog/api-auth";
import { listBulkPhotoCandidates } from "@/lib/blog/media/bulk-photos";
import { searchWebDogPhotos } from "@/lib/blog/media/web-image-search";
import { selectImagesForPosting } from "@/lib/blog/media/select-for-posting";

export const dynamic = "force-dynamic";

/** Preview real photos for blog/social: Digi Board bulk + licensed web (never AI). */
export async function GET(request: Request) {
  const auth = await requireBlogPermission(request, "blog.manage_media");
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const topic = url.searchParams.get("topic") || "dog daycare Santa Monica";
  const mode = url.searchParams.get("mode") || "select";

  try {
    if (mode === "bulk") {
      const photos = await listBulkPhotoCandidates({ topic, limit: 12 });
      return NextResponse.json({ ok: true, source: "bulk", photos });
    }
    if (mode === "web") {
      const photos = await searchWebDogPhotos({ topic, limit: 12 });
      return NextResponse.json({ ok: true, source: "web", photos });
    }
    const selected = await selectImagesForPosting({
      topic,
      total: 6,
      promoteCover: false
    });
    return NextResponse.json({
      ok: true,
      source: "select",
      policy: "real_photography_only_no_ai",
      photos: selected.all,
      notes: selected.notes
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Image search failed" },
      { status: 500 }
    );
  }
}
