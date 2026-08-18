export const STAFF_IDLE_SLIDESHOW_INTERVAL_MS = 8000;
export const STAFF_IDLE_SLIDESHOW_LIMIT = 48;

export type StaffIdleSlideshowSlide = {
  id: string;
  src: string;
  alt: string;
};

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export function staffIdleSlideshowMediaUrl(itemId: string) {
  return `/api/staff/idle-slideshow/media/${encodeURIComponent(itemId)}`;
}

export function shuffleStaffIdleSlides<T>(items: T[], random = Math.random): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const current = next[i]!;
    next[i] = next[j]!;
    next[j] = current;
  }
  return next;
}

/** Keep current + previous (crossfade) and next (preload) in the DOM — never all 48 photos. */
export function visibleStaffIdleSlideIndexes(index: number, length: number): number[] {
  if (length <= 0) return [];
  if (length === 1) return [0];
  const current = ((index % length) + length) % length;
  const previous = (current + length - 1) % length;
  const next = (current + 1) % length;
  return [...new Set([current, previous, next])];
}

export function staffIdleSlideshowStoragePath(row: {
  gingr_ready_storage_path?: string | null;
  thumbnail_storage_path?: string | null;
  original_storage_path?: string | null;
}) {
  return row.gingr_ready_storage_path || row.thumbnail_storage_path || row.original_storage_path || null;
}

function slideAlt(filename: string | null | undefined) {
  const base = String(filename || "")
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .trim();
  return base || "Fitdog media library photo";
}

export async function loadStaffIdleSlideshowSlides(
  supabase: SupabaseClient
): Promise<StaffIdleSlideshowSlide[]> {
  const select =
    "id, original_filename, original_storage_path, thumbnail_storage_path, gingr_ready_storage_path, media_kind, mime_type, duplicate_of_item_id";

  const query = () =>
    supabase
      .from("photo_upload_items")
      .select(select)
      .eq("media_kind", "photo")
      .neq("status", "failed")
      .neq("status", "excluded")
      .order("created_at", { ascending: false })
      .limit(STAFF_IDLE_SLIDESHOW_LIMIT);

  let { data, error } = await query().is("duplicate_of_item_id", null);

  if (error && /duplicate_of_item_id|42703|PGRST204/i.test(`${error.code || ""} ${error.message || ""}`)) {
    ({ data, error } = await query());
  }

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return [];
    throw error;
  }

  const slides = (data ?? [])
    .filter((row) => {
      if (row.duplicate_of_item_id) return false;
      const mime = String(row.mime_type || "").toLowerCase();
      if (mime.startsWith("video/")) return false;
      return Boolean(staffIdleSlideshowStoragePath(row));
    })
    .map((row) => ({
      id: String(row.id),
      src: staffIdleSlideshowMediaUrl(String(row.id)),
      alt: slideAlt(row.original_filename)
    }));

  return shuffleStaffIdleSlides(slides);
}
