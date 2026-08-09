import { listBulkPhotoCandidates } from "@/lib/blog/media/bulk-photos";
import { searchWebDogPhotos } from "@/lib/blog/media/web-image-search";
import { assertRealPhotography, isBlockedBlogSourceClass } from "@/lib/blog/media/ai-image-guard";
import type { BlogImageCandidate, SelectedPostingImages } from "@/lib/blog/media/types";
import { getServiceSupabase } from "@/lib/supabase/server";

export function formatPhotoContextForPrompt(images: BlogImageCandidate[]): string {
  if (!images.length) {
    return "No photos available yet. Do not invent specific photo scenes, dog names, or claim a cover image exists.";
  }
  return images
    .map((img, index) => {
      const dogs = img.dogNames?.length ? ` Dogs pictured (first names only as labeled): ${img.dogNames.join(", ")}.` : "";
      return `${index + 1}. [${img.sourceKind}] ${img.sceneDescription}.${dogs} Alt: ${img.alt}`;
    })
    .join("\n");
}

export function photoAwareWritingRules(): string[] {
  return [
    "Images are REAL photographs only — never AI-generated art or synthetic dogs.",
    "Write so the cover/supporting photos make sense with the copy: describe only what could honestly match the listed scenes.",
    "Do not invent dog names, staff quotes, or events not supported by the photo notes.",
    "If a bulk Fitdog photo is listed, prefer grounded facility language (yard, play, training) over generic stock vibes.",
    "If only web-licensed photos are available, keep claims general and do not pretend the photo was taken at Fitdog.",
    "Never instruct the reader to look at an AI illustration."
  ];
}

async function promoteToMediaLibrary(candidate: BlogImageCandidate, actor?: string | null) {
  assertRealPhotography(
    candidate.sourceKind === "web_licensed" ? "licensed_stock" : "fitdog_owned",
    candidate.alt,
    candidate.caption,
    candidate.sceneDescription,
    candidate.license
  );

  const sourceClass = candidate.sourceKind === "web_licensed" ? "licensed_stock" : "fitdog_owned";
  if (isBlockedBlogSourceClass(sourceClass)) {
    throw new Error("AI-generated source class is blocked.");
  }

  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("blog_media_assets")
      .insert({
        public_url: candidate.url,
        storage_path: candidate.bulkItemId ? `bulk:${candidate.bulkItemId}` : null,
        source_class: sourceClass,
        photographer: candidate.photographer || null,
        license_notes: candidate.license || "",
        usage_restrictions: candidate.licenseUrl || "",
        uploaded_by: actor || "blog-image-selector",
        approval_status: "approved",
        alt_text: candidate.alt,
        caption: candidate.caption,
        tags: [
          ...(candidate.tags || []),
          candidate.sourceKind,
          "auto_selected",
          "real_photography"
        ].filter(Boolean),
        activity: candidate.category || null,
        synthetic_flags: []
      })
      .select("id")
      .single();
    if (error) return null;
    return data?.id ? String(data.id) : null;
  } catch {
    return null;
  }
}

/**
 * Prefer Digi Board bulk photos; fill with licensed web photography.
 * Explicitly excludes AI-generated imagery.
 */
export async function selectImagesForPosting(options: {
  topic: string;
  bulkCount?: number;
  webCount?: number;
  total?: number;
  actor?: string | null;
  promoteCover?: boolean;
}): Promise<SelectedPostingImages & { coverMediaId?: string | null }> {
  const total = Math.min(8, Math.max(1, options.total ?? 4));
  const bulkCount = Math.min(total, Math.max(0, options.bulkCount ?? Math.ceil(total * 0.7)));
  const webCount = Math.min(total, Math.max(0, options.webCount ?? total));
  const notes: string[] = [];

  const [bulk, web] = await Promise.all([
    listBulkPhotoCandidates({ topic: options.topic, limit: Math.max(bulkCount, 6) }),
    searchWebDogPhotos({ topic: options.topic, limit: Math.max(webCount, 6) })
  ]);

  const picked: BlogImageCandidate[] = [];
  for (const img of bulk) {
    if (picked.length >= bulkCount) break;
    try {
      assertRealPhotography("fitdog_owned", img.alt, img.caption, img.sceneDescription);
      picked.push(img);
    } catch {
      notes.push(`Skipped bulk photo flagged as non-real: ${img.id}`);
    }
  }
  if (picked.length) {
    notes.push(`Selected ${picked.length} real photo(s) from Digi Board Bulk Photo library.`);
  } else {
    notes.push("No matching bulk photos available — using licensed web photography only.");
  }

  for (const img of web) {
    if (picked.length >= total) break;
    try {
      assertRealPhotography("licensed_stock", img.alt, img.caption, img.sceneDescription, img.license);
      picked.push(img);
    } catch {
      notes.push(`Skipped web image that looked AI-generated: ${img.id}`);
    }
  }
  if (picked.some((p) => p.sourceKind === "web_licensed")) {
    notes.push("Added licensed web photographs (Openverse/Unsplash/Pexels). AI-generated images are blocked.");
  }

  const cover = picked[0] || null;
  const supporting = picked.slice(1);
  let coverMediaId: string | null = null;
  if (cover && options.promoteCover !== false) {
    coverMediaId = await promoteToMediaLibrary(cover, options.actor);
    if (coverMediaId) notes.push(`Cover registered in Media Library as approved real photography (${coverMediaId}).`);
  }

  return {
    cover,
    supporting,
    all: picked,
    notes,
    coverMediaId
  };
}
