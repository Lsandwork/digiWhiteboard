import { invalidateTtlCache } from "@/lib/server-ttl-cache";

export const STAFF_IDLE_SLIDESHOW_INTERVAL_MS = 20_000;
export const STAFF_IDLE_SLIDESHOW_LIMIT = 24;
/** Poll for newly uploaded media library photos while the board is idle. */
export const STAFF_IDLE_SLIDESHOW_POLL_MS = 60_000;
/** In-memory list cache — cuts Supabase REST load from board polling. */
export const STAFF_IDLE_SLIDESHOW_CACHE_TTL_MS = 60_000;
export const STAFF_IDLE_SLIDESHOW_LAST_GOOD_TTL_MS = 600_000;
export const STAFF_IDLE_SLIDESHOW_CACHE_KEY = "staff-idle-slideshow:list";
export const STAFF_IDLE_SLIDESHOW_LAST_GOOD_KEY = "staff-idle-slideshow:last-good";
/** Cold loads can outlast the 8s board snapshot budget when the pool is busy. */
export const STAFF_IDLE_SLIDESHOW_LOAD_TIMEOUT_MS = 25_000;

export type StaffIdleSlideshowSlide = {
  id: string;
  src: string;
  alt: string;
};

export type StaffIdleSlideshowPayload = {
  slides: StaffIdleSlideshowSlide[];
  intervalMs: number;
  healthy?: boolean;
  stale?: boolean;
  error?: string;
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
  return row.thumbnail_storage_path || row.gingr_ready_storage_path || row.original_storage_path || null;
}

export function formatStaffIdleSlideshowLoadError(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const row = error as { message?: string; code?: string; details?: string; hint?: string };
    const parts = [row.message, row.details, row.hint, row.code].filter(Boolean);
    if (parts.length) return parts.join(" — ");
  }
  return "Unable to load media library slideshow.";
}

export function invalidateStaffIdleSlideshowCache() {
  invalidateTtlCache(STAFF_IDLE_SLIDESHOW_CACHE_KEY);
  invalidateTtlCache(STAFF_IDLE_SLIDESHOW_LAST_GOOD_KEY);
}

function slideAlt(filename: string | null | undefined) {
  const base = String(filename || "")
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .trim();
  return base || "Fitdog media library photo";
}

function isMissingColumnError(error: { code?: string | null; message?: string | null } | null) {
  return /42703|PGRST204/i.test(`${error?.code || ""} ${error?.message || ""}`);
}

export async function loadStaffIdleSlideshowSlides(
  supabase: SupabaseClient
): Promise<StaffIdleSlideshowSlide[]> {
  const select =
    "id, original_filename, original_storage_path, thumbnail_storage_path, gingr_ready_storage_path, mime_type, media_kind, duplicate_of_item_id";

  const query = (options?: { includeMediaKind?: boolean }) => {
    let builder = supabase
      .from("photo_upload_items")
      .select(select)
      .not("status", "in", '("failed","excluded")')
      .order("created_at", { ascending: false })
      .limit(STAFF_IDLE_SLIDESHOW_LIMIT * 2);
    if (options?.includeMediaKind !== false) {
      builder = builder.eq("media_kind", "photo");
    }
    return builder;
  };

  let { data, error } = await query();

  if (error && isMissingColumnError(error) && /media_kind/i.test(`${error.message || ""}`)) {
    ({ data, error } = await query({ includeMediaKind: false }));
  }

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return [];
    throw error;
  }

  const slides = (data ?? [])
    .filter((row) => {
      if (row.duplicate_of_item_id) return false;
      if (row.media_kind === "video") return false;
      const mime = String(row.mime_type || "").toLowerCase();
      if (mime.startsWith("video/")) return false;
      return Boolean(staffIdleSlideshowStoragePath(row));
    })
    .slice(0, STAFF_IDLE_SLIDESHOW_LIMIT)
    .map((row) => ({
      id: String(row.id),
      src: staffIdleSlideshowMediaUrl(String(row.id)),
      alt: slideAlt(row.original_filename)
    }));

  return shuffleStaffIdleSlides(slides);
}
