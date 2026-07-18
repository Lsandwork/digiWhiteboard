import type {
  PhotoAssignmentSource,
  PhotoBatchCounts,
  PhotoUploadBatch,
  PhotoUploadCheckedInDog,
  PhotoUploadExport,
  PhotoUploadItem,
  PhotoUploadOption
} from "@/lib/photo-upload-queue/types";

export type PhotoQueueListResponse = {
  batches: PhotoUploadBatch[];
  categories: PhotoUploadOption[];
  yards: PhotoUploadOption[];
  total?: number;
  page?: number;
  page_size?: number;
};

export type PhotoQueueDetailResponse = {
  batch: PhotoUploadBatch;
  exports?: PhotoUploadExport[];
  categories?: PhotoUploadOption[];
  yards?: PhotoUploadOption[];
  permissions?: {
    can_download?: boolean;
    can_upload?: boolean;
    can_view?: boolean;
  };
};

export type PhotoUploadFileResult = {
  fileName: string;
  ok: boolean;
  item?: PhotoUploadItem;
  error?: string;
};

export type PhotoExportResponse = {
  export: PhotoUploadExport;
  download_url?: string | null;
  zip_url?: string | null;
  single_file?: boolean;
  batch?: PhotoUploadBatch;
};

export type DogAssignmentPayload = {
  gingr_pet_id?: string | null;
  dog_name: string;
  owner_name?: string | null;
  dog_photo_url?: string | null;
  reservation_type?: string | null;
  assignment_source: PhotoAssignmentSource;
};

export type BulkItemsPatch = {
  item_ids: string[];
  yard?: string | null;
  category?: string | null;
  photographer_name?: string | null;
  internal_note?: string | null;
  exclude?: boolean;
  excluded_reason?: string | null;
  duplicate_override?: boolean;
  status?: string;
  dogs?: DogAssignmentPayload[];
};

async function readJson<T>(response: Response): Promise<T & { error?: string }> {
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(body.error || `Request failed (${response.status})`);
  }
  return body;
}

export async function listPhotoBatches(params?: {
  status?: string;
  photographer?: string;
  service_date_from?: string;
  service_date_to?: string;
  q?: string;
  page?: number;
  page_size?: number;
}): Promise<PhotoQueueListResponse> {
  const search = new URLSearchParams();
  if (params?.status) search.set("status", params.status);
  if (params?.photographer) search.set("photographer", params.photographer);
  if (params?.service_date_from) search.set("service_date_from", params.service_date_from);
  if (params?.service_date_to) search.set("service_date_to", params.service_date_to);
  if (params?.q) search.set("q", params.q);
  if (params?.page) search.set("page", String(params.page));
  if (params?.page_size) search.set("page_size", String(params.page_size));
  const query = search.toString();
  const response = await fetch(`/api/admin/photo-upload-queue${query ? `?${query}` : ""}`, {
    cache: "no-store"
  });
  return readJson<PhotoQueueListResponse>(response);
}

export async function createPhotoBatch(input: {
  batch_name: string;
  service_date: string;
  photographer_name: string;
  default_yard: string;
  default_category: string;
  internal_note?: string | null;
}): Promise<PhotoUploadBatch> {
  const response = await fetch("/api/admin/photo-upload-queue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  const body = await readJson<{ batch: PhotoUploadBatch }>(response);
  return body.batch;
}

export async function getPhotoBatch(batchId: string): Promise<PhotoQueueDetailResponse> {
  const response = await fetch(`/api/admin/photo-upload-queue/${batchId}`, { cache: "no-store" });
  return readJson<PhotoQueueDetailResponse>(response);
}

export async function updatePhotoBatch(
  batchId: string,
  patch: Partial<{
    batch_name: string;
    service_date: string;
    photographer_name: string;
    default_yard: string;
    default_category: string;
    internal_note: string | null;
  }>
): Promise<PhotoUploadBatch> {
  const response = await fetch(`/api/admin/photo-upload-queue/${batchId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch)
  });
  const body = await readJson<{ batch: PhotoUploadBatch }>(response);
  return body.batch;
}

export async function uploadPhotoFiles(
  batchId: string,
  files: File[],
  signal?: AbortSignal
): Promise<PhotoUploadFileResult[]> {
  const form = new FormData();
  for (const file of files) {
    form.append("files", file);
  }
  const response = await fetch(`/api/admin/photo-upload-queue/${batchId}/upload`, {
    method: "POST",
    body: form,
    signal
  });
  const body = await readJson<{ results: PhotoUploadFileResult[] }>(response);
  return body.results ?? [];
}

export async function patchPhotoItems(
  batchId: string,
  patch: BulkItemsPatch
): Promise<{ batch?: PhotoUploadBatch; items?: PhotoUploadItem[]; counts?: PhotoBatchCounts }> {
  const response = await fetch(`/api/admin/photo-upload-queue/${batchId}/items`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch)
  });
  return readJson(response);
}

export async function preparePhotoExport(
  batchId: string,
  itemIds?: string[]
): Promise<PhotoExportResponse> {
  const response = await fetch(`/api/admin/photo-upload-queue/${batchId}/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(itemIds?.length ? { item_ids: itemIds } : {})
  });
  return readJson<PhotoExportResponse>(response);
}

export async function markPhotosUploaded(
  batchId: string,
  input: { confirm: true; export_id?: string; item_ids?: string[] }
): Promise<PhotoUploadBatch> {
  const response = await fetch(`/api/admin/photo-upload-queue/${batchId}/mark-uploaded`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  const body = await readJson<{ batch: PhotoUploadBatch }>(response);
  return body.batch;
}

export async function reopenPhotoBatch(batchId: string, reason: string): Promise<PhotoUploadBatch> {
  const response = await fetch(`/api/admin/photo-upload-queue/${batchId}/reopen`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason })
  });
  const body = await readJson<{ batch: PhotoUploadBatch }>(response);
  return body.batch;
}

export async function fetchCheckedInDogs(serviceDate: string): Promise<{
  dogs: PhotoUploadCheckedInDog[];
  warning?: string;
}> {
  const response = await fetch(
    `/api/admin/photo-upload-queue/dogs?service_date=${encodeURIComponent(serviceDate)}`,
    { cache: "no-store" }
  );
  return readJson<{ dogs: PhotoUploadCheckedInDog[]; warning?: string }>(response);
}

export function emptyBatchCounts(): PhotoBatchCounts {
  return {
    total: 0,
    processing: 0,
    needs_dog_assignment: 0,
    needs_review: 0,
    ready_for_gingr: 0,
    included_in_export: 0,
    uploaded_to_gingr: 0,
    excluded: 0,
    failed: 0
  };
}
