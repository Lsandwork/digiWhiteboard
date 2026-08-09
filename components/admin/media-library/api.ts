import type { MediaDatePreset, MediaLibraryListResponse, MediaTypeFilter } from "@/lib/media-library/types";
import type { MediaLibraryItem } from "@/lib/media-library/types";

async function readJson<T>(response: Response): Promise<T & { error?: string }> {
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(body.error || `Request failed (${response.status})`);
  }
  return body;
}

export async function listMediaLibrary(params?: {
  page?: number;
  pageSize?: number;
  q?: string;
  mediaType?: MediaTypeFilter;
  datePreset?: MediaDatePreset;
  dateFrom?: string;
  dateTo?: string;
}): Promise<MediaLibraryListResponse> {
  const search = new URLSearchParams();
  if (params?.page) search.set("page", String(params.page));
  if (params?.pageSize) search.set("page_size", String(params.pageSize));
  if (params?.q) search.set("q", params.q);
  if (params?.mediaType) search.set("media_type", params.mediaType);
  if (params?.datePreset) search.set("date_preset", params.datePreset);
  if (params?.dateFrom) search.set("date_from", params.dateFrom);
  if (params?.dateTo) search.set("date_to", params.dateTo);

  const query = search.toString();
  const response = await fetch(`/api/admin/media-library${query ? `?${query}` : ""}`, {
    cache: "no-store"
  });
  return readJson<MediaLibraryListResponse>(response);
}

export async function getMediaLibraryItem(itemId: string): Promise<MediaLibraryItem> {
  const response = await fetch(`/api/admin/media-library/${encodeURIComponent(itemId)}`, {
    cache: "no-store"
  });
  const body = await readJson<{ item: MediaLibraryItem }>(response);
  return body.item;
}
