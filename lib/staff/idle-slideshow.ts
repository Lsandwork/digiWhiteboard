import { invalidateTtlCache, setTtlCache } from "@/lib/server-ttl-cache";

export const STAFF_IDLE_SLIDESHOW_INTERVAL_MS = 20_000;
export const STAFF_IDLE_SLIDESHOW_LIMIT = 24;
/** Poll for newly uploaded media library photos while the board is idle. */
export const STAFF_IDLE_SLIDESHOW_POLL_MS = 60_000;
/**
 * After a failed/slow media-library read, wait this long before asking again.
 * Aggressive retries were stacking 40–60s Vercel+Supabase calls on the staff board.
 */
export const STAFF_IDLE_SLIDESHOW_RETRY_POLL_MS = 5 * 60_000;
/** Hard budget for the list API — never wait on a hung Supabase round-trip. */
export const STAFF_IDLE_SLIDESHOW_DB_TIMEOUT_MS = 4_000;
/** Browser abort for `/api/staff/idle-slideshow` so the empty state is not stuck on "Loading…". */
export const STAFF_IDLE_SLIDESHOW_CLIENT_FETCH_TIMEOUT_MS = 6_000;
/** Media proxy budget — prefer a fast miss over a hung TV frame. */
export const STAFF_IDLE_SLIDESHOW_MEDIA_TIMEOUT_MS = 5_000;
/** In-memory list cache — cuts Supabase REST load from board polling. */
export const STAFF_IDLE_SLIDESHOW_CACHE_TTL_MS = 60_000;
export const STAFF_IDLE_SLIDESHOW_LAST_GOOD_TTL_MS = 600_000;
export const STAFF_IDLE_SLIDESHOW_CACHE_KEY = "staff-idle-slideshow:list";
export const STAFF_IDLE_SLIDESHOW_LAST_GOOD_KEY = "staff-idle-slideshow:last-good";
/** Only scan recent uploads — full-table order-by was timing out in production. */
export const STAFF_IDLE_SLIDESHOW_LOOKBACK_DAYS = 180;
/** Minimum gap between background cache warms after a miss/timeout. */
export const STAFF_IDLE_SLIDESHOW_WARM_COOLDOWN_MS = 5 * 60_000;

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
  retrying?: boolean;
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

export function staffIdleSlideshowLookbackSince(days = STAFF_IDLE_SLIDESHOW_LOOKBACK_DAYS) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export function formatStaffIdleSlideshowLoadError(error: unknown) {
  let message = "Unable to load media library slideshow.";
  if (error instanceof Error && error.message) message = error.message;
  else if (error && typeof error === "object") {
    const row = error as { message?: string; code?: string; details?: string; hint?: string };
    const parts = [row.message, row.details, row.hint, row.code].filter(Boolean);
    if (parts.length) message = parts.join(" — ");
  }
  if (/522|Connection timed out|supabase\.co/i.test(message) || message.includes("<!DOCTYPE html>")) {
    return "Media library database is temporarily unavailable. Retrying…";
  }
  return message.length > 240 ? `${message.slice(0, 240)}…` : message;
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
  const since = staffIdleSlideshowLookbackSince();

  const query = (options?: { includeMediaKind?: boolean; includeLookback?: boolean }) => {
    let builder = supabase
      .from("photo_upload_items")
      .select(select)
      .not("status", "in", "(failed,excluded)")
      .order("created_at", { ascending: false })
      .limit(STAFF_IDLE_SLIDESHOW_LIMIT * 2);
    if (options?.includeLookback !== false) {
      builder = builder.gte("created_at", since);
    }
    if (options?.includeMediaKind !== false) {
      builder = builder.eq("media_kind", "photo");
    }
    return builder;
  };

  let { data, error } = await query();

  if (error && isMissingColumnError(error) && /media_kind/i.test(`${error.message || ""}`)) {
    ({ data, error } = await query({ includeMediaKind: false }));
  }

  if (error && isMissingColumnError(error) && /created_at/i.test(`${error.message || ""}`)) {
    ({ data, error } = await query({ includeLookback: false }));
    if (error && isMissingColumnError(error) && /media_kind/i.test(`${error.message || ""}`)) {
      ({ data, error } = await query({ includeLookback: false, includeMediaKind: false }));
    }
  }

  if (!error && !(data ?? []).length) {
    ({ data, error } = await query({ includeLookback: false }));
    if (error && isMissingColumnError(error) && /media_kind/i.test(`${error.message || ""}`)) {
      ({ data, error } = await query({ includeLookback: false, includeMediaKind: false }));
    }
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

export function storeStaffIdleSlideshowPayload(slides: StaffIdleSlideshowSlide[]): StaffIdleSlideshowPayload {
  const payload: StaffIdleSlideshowPayload = {
    slides,
    intervalMs: STAFF_IDLE_SLIDESHOW_INTERVAL_MS,
    healthy: true
  };
  setTtlCache(STAFF_IDLE_SLIDESHOW_CACHE_KEY, slides, STAFF_IDLE_SLIDESHOW_CACHE_TTL_MS);
  setTtlCache(STAFF_IDLE_SLIDESHOW_LAST_GOOD_KEY, payload, STAFF_IDLE_SLIDESHOW_LAST_GOOD_TTL_MS);
  return payload;
}
