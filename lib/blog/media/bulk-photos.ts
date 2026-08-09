import { getServiceSupabase } from "@/lib/supabase/server";
import { createPhotoSignedUrl } from "@/lib/photo-upload-queue/storage";
import { photoMediaUrl } from "@/lib/photo-upload-queue/service";
import type { BlogImageCandidate } from "@/lib/blog/media/types";

type BulkRow = {
  id: string;
  original_filename: string;
  original_storage_path: string;
  thumbnail_storage_path: string | null;
  yard: string | null;
  category: string | null;
  photographer_name: string | null;
  internal_note: string | null;
  status: string;
  width: number | null;
  height: number | null;
  created_at: string;
  photo_upload_batches?: { batch_name?: string; service_date?: string; status?: string } | null;
};

const TOPIC_CATEGORY_HINTS: Array<{ re: RegExp; categories: string[]; yards: string[] }> = [
  { re: /board|overnight|sleep|hotel/i, categories: ["boarding", "nap", "rest"], yards: [] },
  { re: /train|obedience|cue|leash|manners/i, categories: ["training", "enrichment"], yards: [] },
  { re: /hike|trail|outing|walk|adventure/i, categories: ["hike", "outing", "walk"], yards: ["outdoor"] },
  { re: /groom|bath|nail/i, categories: ["grooming"], yards: [] },
  { re: /enrich|puzzle|brain|mental/i, categories: ["enrichment", "training"], yards: [] },
  { re: /play|daycare|drop.?off|social|yard|pup/i, categories: ["play", "daycare", "group"], yards: ["big", "small", "medium", "outdoor"] }
];

function scoreBulkForTopic(row: BulkRow, dogNames: string[], topic: string): number {
  let score = 10;
  const cat = String(row.category || "").toLowerCase();
  const yard = String(row.yard || "").toLowerCase();
  const note = String(row.internal_note || "").toLowerCase();
  const file = String(row.original_filename || "").toLowerCase();
  const hay = `${cat} ${yard} ${note} ${file} ${dogNames.join(" ")}`.toLowerCase();

  for (const hint of TOPIC_CATEGORY_HINTS) {
    if (!hint.re.test(topic)) continue;
    if (hint.categories.some((c) => cat.includes(c) || hay.includes(c))) score += 24;
    if (hint.yards.some((y) => yard.includes(y))) score += 8;
  }

  // Prefer usable / transferred facility photos
  if (["ready_for_gingr", "included_in_export", "uploaded_to_gingr", "needs_review"].includes(row.status)) {
    score += 12;
  }
  if (row.status === "excluded" || row.status === "failed") score -= 100;
  if (dogNames.length) score += 6 + Math.min(dogNames.length, 3);
  // Prefer landscape-ish for blog covers when known
  if (row.width && row.height && row.width >= row.height) score += 4;
  return score;
}

function buildSceneDescription(row: BulkRow, dogNames: string[]): string {
  const parts: string[] = ["Real Fitdog facility photo"];
  if (row.category) parts.push(`activity: ${row.category.replace(/_/g, " ")}`);
  if (row.yard) parts.push(`area: ${row.yard.replace(/_/g, " ")} yard`);
  if (dogNames.length) parts.push(`dogs in frame: ${dogNames.slice(0, 4).join(", ")}`);
  if (row.photo_upload_batches?.service_date) {
    parts.push(`from Digi Board bulk library (${row.photo_upload_batches.service_date})`);
  }
  return parts.join(" · ");
}

/**
 * Pull recent real photos from Digi Board Bulk Photo Upload for blog/social.
 * Never fabricates imagery — only existing uploaded files.
 */
export async function listBulkPhotoCandidates(options?: {
  topic?: string;
  limit?: number;
  daysBack?: number;
}): Promise<BlogImageCandidate[]> {
  const limit = Math.min(40, Math.max(1, options?.limit ?? 16));
  const daysBack = Math.min(90, Math.max(1, options?.daysBack ?? 45));
  const topic = String(options?.topic || "");

  try {
    const supabase = getServiceSupabase();
    const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();
    const { data: rows, error } = await supabase
      .from("photo_upload_items")
      .select(
        "id, original_filename, original_storage_path, thumbnail_storage_path, yard, category, photographer_name, internal_note, status, width, height, created_at, photo_upload_batches(batch_name, service_date, status)"
      )
      .gte("created_at", since)
      .not("status", "in", "(failed,excluded,processing)")
      .order("created_at", { ascending: false })
      .limit(80);

    if (error || !rows?.length) return [];

    const itemIds = rows.map((r) => String(r.id));
    const { data: dogRows } = await supabase
      .from("photo_upload_item_dogs")
      .select("photo_item_id, dog_name")
      .in("photo_item_id", itemIds);

    const dogsByItem = new Map<string, string[]>();
    for (const dog of dogRows || []) {
      const id = String(dog.photo_item_id);
      const list = dogsByItem.get(id) || [];
      if (dog.dog_name) list.push(String(dog.dog_name));
      dogsByItem.set(id, list);
    }

    const scored = await Promise.all(
      (rows as BulkRow[]).map(async (row) => {
        const dogNames = dogsByItem.get(String(row.id)) || [];
        const score = scoreBulkForTopic(row, dogNames, topic);
        const signed =
          (await createPhotoSignedUrl(supabase, row.original_storage_path, 60 * 60 * 24 * 7)) ||
          photoMediaUrl(String(row.id), "original");
        const thumb =
          (await createPhotoSignedUrl(supabase, row.thumbnail_storage_path, 60 * 60 * 24 * 7)) ||
          photoMediaUrl(String(row.id), "thumbnail");
        const scene = buildSceneDescription(row, dogNames);
        const candidate: BlogImageCandidate = {
          id: `bulk:${row.id}`,
          sourceKind: "bulk_photo",
          url: signed,
          thumbUrl: thumb,
          alt: dogNames.length
            ? `Fitdog dogs ${dogNames.slice(0, 3).join(", ")} at daycare`
            : `Fitdog daycare photo${row.category ? ` — ${row.category}` : ""}`,
          caption: scene,
          sceneDescription: scene,
          photographer: row.photographer_name || "Fitdog staff",
          license: "Fitdog-owned facility photography from Digi Board Bulk Photo library",
          bulkItemId: String(row.id),
          dogNames,
          yard: row.yard,
          category: row.category,
          tags: [row.category, row.yard, ...dogNames].filter(Boolean) as string[],
          width: row.width,
          height: row.height
        };
        return { score, candidate };
      })
    );

    return scored
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((row) => row.candidate);
  } catch {
    return [];
  }
}
