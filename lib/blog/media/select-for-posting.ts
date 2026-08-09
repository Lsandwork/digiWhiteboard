import { listBulkPhotoCandidates } from "@/lib/blog/media/bulk-photos";
import { searchWebDogPhotos } from "@/lib/blog/media/web-image-search";
import { assertRealPhotography, isBlockedBlogSourceClass } from "@/lib/blog/media/ai-image-guard";
import {
  MIN_BULK_RELEVANCE_SCORE,
  MIN_WEB_RELEVANCE_SCORE,
  scoreImageRelevance
} from "@/lib/blog/media/image-relevance";
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
          "real_photography",
          "topic_relevant"
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

function diversifyBulk(candidates: BlogImageCandidate[], limit: number): BlogImageCandidate[] {
  const picked: BlogImageCandidate[] = [];
  const seenDogs = new Set<string>();
  const seenFiles = new Set<string>();

  for (const img of candidates) {
    if (picked.length >= limit) break;
    const fileKey = (img.url || img.id).split("?")[0] || img.id;
    if (seenFiles.has(fileKey)) continue;
    const dogKey = (img.dogNames || []).slice().sort().join("|") || img.sceneDescription.slice(0, 40);
    // Prefer variety: allow at most 2 frames of the same dog set.
    const dogCount = [...picked].filter(
      (p) => ((p.dogNames || []).slice().sort().join("|") || p.sceneDescription.slice(0, 40)) === dogKey
    ).length;
    if (dogCount >= 2 && seenDogs.has(dogKey)) continue;
    seenDogs.add(dogKey);
    seenFiles.add(fileKey);
    picked.push(img);
  }

  // If still short, fill remaining unique files.
  if (picked.length < limit) {
    for (const img of candidates) {
      if (picked.length >= limit) break;
      if (picked.some((p) => p.id === img.id)) continue;
      picked.push(img);
    }
  }
  return picked;
}

/**
 * Prefer Digi Board bulk photos; fill only with topic-relevant licensed web photos.
 * Never attaches off-topic art (statues, holidays, skeletons, etc.).
 */
export async function selectImagesForPosting(options: {
  topic: string;
  bulkCount?: number;
  webCount?: number;
  total?: number;
  actor?: string | null;
  promoteCover?: boolean;
  excludeIds?: string[];
}): Promise<SelectedPostingImages & { coverMediaId?: string | null }> {
  const total = Math.min(8, Math.max(1, options.total ?? 4));
  const bulkCount = Math.min(total, Math.max(0, options.bulkCount ?? total));
  const webCount = Math.min(total, Math.max(0, options.webCount ?? 2));
  const exclude = new Set(options.excludeIds || []);
  const notes: string[] = [];

  const [bulkRaw, webRaw] = await Promise.all([
    listBulkPhotoCandidates({ topic: options.topic, limit: Math.max(bulkCount * 3, 12) }),
    searchWebDogPhotos({
      topic: options.topic,
      limit: Math.max(webCount * 4, 10),
      excludeIds: options.excludeIds
    })
  ]);

  const bulkScored = bulkRaw
    .filter((img) => !exclude.has(img.id))
    .map((img) => ({
      img,
      score: scoreImageRelevance(options.topic, {
        title: img.alt,
        alt: img.alt,
        caption: img.caption,
        sceneDescription: img.sceneDescription,
        category: img.category,
        yard: img.yard,
        tags: img.tags,
        sourceKind: "bulk_photo"
      })
    }))
    .filter((row) => row.score >= MIN_BULK_RELEVANCE_SCORE)
    .sort((a, b) => b.score - a.score)
    .map((row) => row.img);

  const bulk = diversifyBulk(bulkScored, bulkCount);
  const picked: BlogImageCandidate[] = [];

  for (const img of bulk) {
    if (picked.length >= total) break;
    try {
      assertRealPhotography("fitdog_owned", img.alt, img.caption, img.sceneDescription);
      picked.push(img);
    } catch {
      notes.push(`Skipped bulk photo flagged as non-real: ${img.id}`);
    }
  }
  if (picked.length) {
    notes.push(`Selected ${picked.length} real photo(s) from Digi Board Bulk Photo library.`);
  }

  // Only add web photos when they clear a strict relevance bar — never pad with junk.
  let webAdded = 0;
  for (const img of webRaw) {
    if (picked.length >= total) break;
    if (exclude.has(img.id) || picked.some((p) => p.id === img.id || p.url === img.url)) continue;
    const score = scoreImageRelevance(options.topic, {
      title: img.alt,
      alt: img.alt,
      caption: img.caption,
      sceneDescription: img.sceneDescription,
      tags: img.tags,
      sourceKind: "web_licensed"
    });
    if (score < MIN_WEB_RELEVANCE_SCORE) {
      notes.push(`Rejected off-topic web photo: ${img.alt.slice(0, 60)}`);
      continue;
    }
    try {
      assertRealPhotography("licensed_stock", img.alt, img.caption, img.sceneDescription, img.license);
      picked.push(img);
      webAdded += 1;
    } catch {
      notes.push(`Skipped web image that looked AI-generated: ${img.id}`);
    }
  }
  if (webAdded) {
    notes.push(`Added ${webAdded} topic-matched licensed web photo(s). Off-topic results were blocked.`);
  } else if (picked.length < total) {
    notes.push("No topic-matched web photos found — kept Fitdog bulk photos only (better than unrelated stock).");
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

/** Alternatives for replacing one selected image (bulk first, then relevant web). */
export async function listReplacementImageOptions(options: {
  topic: string;
  excludeIds?: string[];
  limit?: number;
}): Promise<{ photos: BlogImageCandidate[]; notes: string[] }> {
  const limit = Math.min(18, Math.max(4, options.limit ?? 12));
  const selected = await selectImagesForPosting({
    topic: options.topic,
    total: limit,
    bulkCount: limit,
    webCount: Math.min(6, limit),
    promoteCover: false,
    excludeIds: options.excludeIds
  });
  return { photos: selected.all, notes: selected.notes };
}
