import { NextResponse } from "next/server";
import { requireBlogPermission } from "@/lib/blog/api-auth";
import { listBulkPhotoCandidates } from "@/lib/blog/media/bulk-photos";
import { searchWebDogPhotos } from "@/lib/blog/media/web-image-search";
import {
  listReplacementImageOptions,
  selectImagesForPosting
} from "@/lib/blog/media/select-for-posting";

export const dynamic = "force-dynamic";

/** Preview real photos for blog/social: Digi Board bulk + licensed web (never AI). */
export async function GET(request: Request) {
  const auth = await requireBlogPermission(request, "blog.manage_media");
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const topic = url.searchParams.get("topic") || "dog daycare Santa Monica";
  const mode = url.searchParams.get("mode") || "select";
  const excludeIds = (url.searchParams.get("excludeIds") || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  try {
    if (mode === "bulk") {
      const photos = await listBulkPhotoCandidates({ topic, limit: 12 });
      return NextResponse.json({ ok: true, source: "bulk", photos });
    }
    if (mode === "web") {
      const photos = await searchWebDogPhotos({ topic, limit: 12, excludeIds });
      return NextResponse.json({ ok: true, source: "web", photos });
    }
    if (mode === "replace") {
      const result = await listReplacementImageOptions({
        topic,
        excludeIds,
        limit: 12
      });
      return NextResponse.json({
        ok: true,
        source: "replace",
        policy: "topic_relevant_real_photography_only",
        photos: result.photos,
        notes: result.notes
      });
    }
    const selected = await selectImagesForPosting({
      topic,
      total: 6,
      promoteCover: false,
      excludeIds
    });
    return NextResponse.json({
      ok: true,
      source: "select",
      policy: "real_photography_only_no_ai_topic_matched",
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
