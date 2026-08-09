import type { PhotoUploadItem } from "@/lib/photo-upload-queue/types";

export const MEDIA_LIBRARY_PAGE_SIZE = 48;
export const MEDIA_VIDEO_MAX_BYTES = 250 * 1024 * 1024;

export const MEDIA_VIDEO_ALLOWED_MIME = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime"
]);

export type MediaKind = "photo" | "video";
export type MediaTypeFilter = "all" | "photos" | "videos";
export type MediaDatePreset = "today" | "yesterday" | "this_week" | "this_month" | "older" | "custom" | "all";

export type MediaLibraryItem = PhotoUploadItem & {
  media_kind: MediaKind;
  duration_seconds: number | null;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  service_date?: string | null;
  batch_name?: string | null;
  uploader_label?: string | null;
};

export type MediaLibraryListResponse = {
  items: MediaLibraryItem[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
  permissions: {
    can_download: boolean;
    can_upload: boolean;
    can_view: boolean;
  };
};

export type MediaLibraryFilters = {
  page?: number;
  pageSize?: number;
  q?: string;
  mediaType?: MediaTypeFilter;
  datePreset?: MediaDatePreset;
  dateFrom?: string;
  dateTo?: string;
};
