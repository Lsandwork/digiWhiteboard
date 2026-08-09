import { canDownloadPhotoUploads } from "@/lib/photo-upload-queue/access";
import { photoMediaUrl, type PhotoQueueActor } from "@/lib/photo-upload-queue/service";
import type { PhotoUploadItem } from "@/lib/photo-upload-queue/types";
import { pacificDateKey } from "@/lib/staff/front-desk-log";
import type { UserAccess } from "@/lib/admin/permissions";
import type { getServiceSupabase } from "@/lib/supabase/server";
import {
  MEDIA_LIBRARY_PAGE_SIZE,
  type MediaDatePreset,
  type MediaKind,
  type MediaLibraryFilters,
  type MediaLibraryItem,
  type MediaTypeFilter
} from "@/lib/media-library/types";

type SupabaseClient = ReturnType<typeof getServiceSupabase>;

type BatchJoin = {
  service_date?: string | null;
  batch_name?: string | null;
  created_by_name?: string | null;
  photographer_name?: string | null;
};

function isDateOnly(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function addPacificDays(dateKey: string, days: number) {
  const probe = new Date(`${dateKey}T12:00:00-08:00`);
  probe.setUTCDate(probe.getUTCDate() + days);
  return pacificDateKey(probe) || dateKey;
}

function startOfPacificWeek(dateKey: string) {
  const probe = new Date(`${dateKey}T12:00:00-08:00`);
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short"
  }).format(probe);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const offset = map[weekday] ?? 0;
  return addPacificDays(dateKey, -offset);
}

function startOfPacificMonth(dateKey: string) {
  return `${dateKey.slice(0, 7)}-01`;
}

function pacificDayBounds(serviceDate: string) {
  try {
    const probe = new Date(`${serviceDate}T12:00:00Z`);
    const offsetParts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      timeZoneName: "shortOffset"
    }).formatToParts(probe);
    const tzName = offsetParts.find((p) => p.type === "timeZoneName")?.value ?? "GMT-7";
    const match = tzName.match(/GMT([+-]\d+)(?::(\d+))?/);
    if (match) {
      const hours = Number(match[1]);
      const mins = Number(match[2] ?? 0);
      const offsetMs = (hours * 60 + Math.sign(hours) * mins) * 60 * 1000;
      const utcStart = new Date(Date.parse(`${serviceDate}T00:00:00.000Z`) - offsetMs);
      return {
        startIso: utcStart.toISOString(),
        endIso: new Date(utcStart.getTime() + 24 * 60 * 60 * 1000).toISOString()
      };
    }
  } catch {
    // fall through
  }
  const start = new Date(`${serviceDate}T00:00:00-07:00`);
  return {
    startIso: start.toISOString(),
    endIso: new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString()
  };
}

function resolveCreatedAtRange(filters: MediaLibraryFilters): { gte?: string; lt?: string } {
  const today = pacificDateKey(new Date()) || new Date().toISOString().slice(0, 10);
  const preset = (filters.datePreset || "all") as MediaDatePreset;

  if (preset === "custom" || filters.dateFrom || filters.dateTo) {
    const from = filters.dateFrom && isDateOnly(filters.dateFrom) ? filters.dateFrom : null;
    const to = filters.dateTo && isDateOnly(filters.dateTo) ? filters.dateTo : null;
    if (!from && !to) return {};
    const start = from ? pacificDayBounds(from).startIso : undefined;
    const end = to ? pacificDayBounds(to).endIso : undefined;
    return { gte: start, lt: end };
  }

  if (preset === "today") {
    const bounds = pacificDayBounds(today);
    return { gte: bounds.startIso, lt: bounds.endIso };
  }

  if (preset === "yesterday") {
    const yesterday = addPacificDays(today, -1);
    const bounds = pacificDayBounds(yesterday);
    return { gte: bounds.startIso, lt: bounds.endIso };
  }

  if (preset === "this_week") {
    const weekStart = startOfPacificWeek(today);
    const tomorrow = addPacificDays(today, 1);
    return {
      gte: pacificDayBounds(weekStart).startIso,
      lt: pacificDayBounds(tomorrow).startIso
    };
  }

  if (preset === "this_month") {
    const monthStart = startOfPacificMonth(today);
    const tomorrow = addPacificDays(today, 1);
    return {
      gte: pacificDayBounds(monthStart).startIso,
      lt: pacificDayBounds(tomorrow).startIso
    };
  }

  if (preset === "older") {
    const monthStart = startOfPacificMonth(today);
    return { lt: pacificDayBounds(monthStart).startIso };
  }

  return {};
}

function deriveMediaKind(row: { media_kind?: string | null; mime_type?: string | null }): MediaKind {
  if (row.media_kind === "video" || row.media_kind === "photo") return row.media_kind;
  if ((row.mime_type || "").toLowerCase().startsWith("video/")) return "video";
  return "photo";
}

function mapLibraryItem(row: Record<string, unknown>, canDownload: boolean): MediaLibraryItem {
  const batch = (row.photo_upload_batches as BatchJoin | BatchJoin[] | null | undefined) ?? null;
  const batchRow = Array.isArray(batch) ? batch[0] : batch;
  const id = String(row.id);
  const mediaKind = deriveMediaKind({
    media_kind: row.media_kind as string | null | undefined,
    mime_type: row.mime_type as string | null | undefined
  });
  const uploadedByName =
    (typeof row.uploaded_by_name === "string" && row.uploaded_by_name.trim()) ||
    (typeof row.photographer_name === "string" && row.photographer_name.trim()) ||
    batchRow?.created_by_name ||
    batchRow?.photographer_name ||
    null;

  const base = row as unknown as PhotoUploadItem;
  return {
    ...base,
    media_kind: mediaKind,
    duration_seconds:
      row.duration_seconds == null || row.duration_seconds === ""
        ? null
        : Number(row.duration_seconds),
    uploaded_by: (row.uploaded_by as string | null) ?? null,
    uploaded_by_name: (row.uploaded_by_name as string | null) ?? null,
    service_date: batchRow?.service_date ?? null,
    batch_name: batchRow?.batch_name ?? null,
    uploader_label: uploadedByName,
    thumbnail_url: photoMediaUrl(id, "thumbnail"),
    original_url: photoMediaUrl(id, "original")
  };
}

export async function listMediaLibrary(
  supabase: SupabaseClient,
  filters: MediaLibraryFilters,
  options: { access: UserAccess | null | undefined; role?: string | null }
) {
  const page = Math.max(1, Number(filters.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize || MEDIA_LIBRARY_PAGE_SIZE)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const canDownload = canDownloadPhotoUploads(options.access, options.role);
  const mediaType = (filters.mediaType || "all") as MediaTypeFilter;
  const q = String(filters.q || "").trim();
  const range = resolveCreatedAtRange(filters);

  let query = supabase
    .from("photo_upload_items")
    .select(
      `
      id, batch_id, original_filename, stored_filename, original_storage_path,
      thumbnail_storage_path, gingr_ready_storage_path, mime_type, file_size, width, height,
      sha256_hash, yard, category, photographer_name, internal_note, status,
      duplicate_of_item_id, duplicate_override, excluded_reason, failure_reason,
      created_at, updated_at, uploaded_to_gingr_at, uploaded_to_gingr_by,
      media_kind, duration_seconds, uploaded_by, uploaded_by_name,
      photo_upload_batches!inner(service_date, batch_name, created_by_name, photographer_name)
    `,
      { count: "exact" }
    )
    .neq("status", "failed")
    .order("created_at", { ascending: false })
    .range(from, to);

  if (mediaType === "photos") query = query.eq("media_kind", "photo");
  if (mediaType === "videos") query = query.eq("media_kind", "video");
  if (q) query = query.ilike("original_filename", `%${q.replace(/[%_]/g, "\\$&")}%`);
  if (range.gte) query = query.gte("created_at", range.gte);
  if (range.lt) query = query.lt("created_at", range.lt);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message || "Unable to load media library.");

  const items = (data ?? []).map((row) => mapLibraryItem(row as Record<string, unknown>, canDownload));
  const total = count ?? items.length;

  return {
    items,
    total,
    page,
    page_size: pageSize,
    has_more: from + items.length < total,
    permissions: {
      can_download: canDownload,
      can_upload: true,
      can_view: true
    }
  };
}

export async function getMediaLibraryItem(
  supabase: SupabaseClient,
  itemId: string,
  options: { access: UserAccess | null | undefined; role?: string | null }
) {
  const canDownload = canDownloadPhotoUploads(options.access, options.role);
  const { data, error } = await supabase
    .from("photo_upload_items")
    .select(
      `
      id, batch_id, original_filename, stored_filename, original_storage_path,
      thumbnail_storage_path, gingr_ready_storage_path, mime_type, file_size, width, height,
      sha256_hash, yard, category, photographer_name, internal_note, status,
      duplicate_of_item_id, duplicate_override, excluded_reason, failure_reason,
      created_at, updated_at, uploaded_to_gingr_at, uploaded_to_gingr_by,
      media_kind, duration_seconds, uploaded_by, uploaded_by_name,
      photo_upload_batches!inner(service_date, batch_name, created_by_name, photographer_name)
    `
    )
    .eq("id", itemId)
    .maybeSingle();

  if (error) throw new Error(error.message || "Unable to load media item.");
  if (!data) return null;
  return mapLibraryItem(data as Record<string, unknown>, canDownload);
}

export function actorUploadMeta(actor: PhotoQueueActor) {
  return {
    uploaded_by: actor.id ?? null,
    uploaded_by_name: actor.name?.trim() || actor.email?.trim() || "Staff"
  };
}
