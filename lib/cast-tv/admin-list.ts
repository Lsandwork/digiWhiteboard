import { castTvStorageThumbUrl } from "@/lib/cast-tv/thumbs";
import type { CastTvMediaRecord } from "@/lib/cast-tv/types";

export const CAST_TV_ADMIN_PAGE_SIZE = 20;

export type CastTvAdminListStatus = "active" | "disabled";

export type CastTvAdminListItem = {
  id: string;
  display_name: string | null;
  file_name: string;
  storage_path: string;
  bucket: string | null;
  public_url: string | null;
  thumb_url: string | null;
  media_type: CastTvMediaRecord["media_type"];
  mime_type: string | null;
  file_size_bytes: number | null;
  image_display_seconds: CastTvMediaRecord["image_display_seconds"];
  display_order: number;
  is_enabled: boolean;
  uploaded_by_name: string | null;
  created_at: string;
  updated_at: string;
  storage_missing: boolean;
};

export type CastTvMediaCounts = {
  active: number;
  disabled: number;
  missing: number;
  total: number;
};

const ADMIN_LIST_FIELDS = [
  "id",
  "display_name",
  "file_name",
  "storage_path",
  "bucket",
  "public_url",
  "thumb_url",
  "media_type",
  "mime_type",
  "file_size_bytes",
  "image_display_seconds",
  "display_order",
  "is_enabled",
  "uploaded_by_name",
  "created_at",
  "updated_at",
  "storage_missing"
] as const;

void ADMIN_LIST_FIELDS;

export function castTvMediaCounts(records: CastTvMediaRecord[]): CastTvMediaCounts {
  let active = 0;
  let disabled = 0;
  let missing = 0;
  for (const item of records) {
    if (item.storage_missing) missing += 1;
    if (item.is_enabled) active += 1;
    else disabled += 1;
  }
  return { active, disabled, missing, total: records.length };
}

export function filterCastTvAdminMedia(records: CastTvMediaRecord[], status: CastTvAdminListStatus) {
  return records
    .filter((item) => (status === "disabled" ? !item.is_enabled : item.is_enabled))
    .sort((a, b) => a.display_order - b.display_order || a.created_at.localeCompare(b.created_at));
}

export function toCastTvAdminListItem(record: CastTvMediaRecord): CastTvAdminListItem {
  return {
    id: record.id,
    display_name: record.display_name,
    file_name: record.file_name,
    storage_path: record.storage_path,
    bucket: record.bucket ?? null,
    public_url: record.public_url,
    thumb_url: castTvStorageThumbUrl(record),
    media_type: record.media_type,
    mime_type: record.mime_type,
    file_size_bytes: record.file_size_bytes,
    image_display_seconds: record.image_display_seconds,
    display_order: record.display_order,
    is_enabled: record.is_enabled !== false,
    uploaded_by_name: record.uploaded_by_name,
    created_at: record.created_at,
    updated_at: record.updated_at,
    storage_missing: record.storage_missing === true
  };
}

export function paginateCastTvAdminMedia(
  records: CastTvMediaRecord[],
  input: { status: CastTvAdminListStatus; offset: number; limit: number }
) {
  const filtered = filterCastTvAdminMedia(records, input.status);
  const offset = Math.max(0, input.offset);
  const limit = Math.min(50, Math.max(1, input.limit));
  const slice = filtered.slice(offset, offset + limit);
  return {
    items: slice.map(toCastTvAdminListItem),
    page: {
      status: input.status,
      offset,
      limit,
      total: filtered.length,
      hasMore: offset + limit < filtered.length
    },
    counts: castTvMediaCounts(records)
  };
}

export function mediaRevisionFromLibrary(records: CastTvMediaRecord[], settingsUpdatedAt: string) {
  let newest = settingsUpdatedAt;
  for (const item of records) {
    if (item.updated_at > newest) newest = item.updated_at;
  }
  const counts = castTvMediaCounts(records);
  return `${counts.total}:${counts.active}:${counts.disabled}:${counts.missing}:${newest}`;
}
