export const PHOTO_UPLOAD_BUCKET = "photo-uploads";
export const PHOTO_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
export const PHOTO_UPLOAD_SIGNED_URL_SECONDS = 60 * 60 * 4;

export const PHOTO_UPLOAD_ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp"
]);

export type PhotoBatchStatus =
  | "draft"
  | "processing"
  | "needs_review"
  | "ready"
  | "exported"
  | "partially_uploaded"
  | "uploaded_to_gingr"
  | "archived";

export type PhotoItemStatus =
  | "processing"
  | "needs_dog_assignment"
  | "needs_review"
  | "ready_for_gingr"
  | "included_in_export"
  | "uploaded_to_gingr"
  | "excluded"
  | "failed";

export type PhotoAssignmentSource = "checked_in" | "manual" | "bulk";

export type PhotoUploadCheckedInDog = {
  dogId: string;
  dogName: string;
  ownerName?: string;
  dogPhotoUrl?: string;
  status: string;
  displayStatus: string;
  reservationType?: string;
  gingrAnimalId?: string;
  checkedInAt?: string;
};

export type PhotoUploadDogAssignment = {
  id: string;
  photo_item_id: string;
  gingr_pet_id: string | null;
  dog_name: string;
  owner_name: string | null;
  dog_photo_url: string | null;
  reservation_type: string | null;
  assignment_source: PhotoAssignmentSource;
  created_at: string;
};

export type PhotoUploadItem = {
  id: string;
  batch_id: string;
  original_filename: string;
  stored_filename: string;
  original_storage_path: string;
  thumbnail_storage_path: string | null;
  gingr_ready_storage_path: string | null;
  mime_type: string | null;
  file_size: number | null;
  width: number | null;
  height: number | null;
  sha256_hash: string;
  yard: string | null;
  category: string | null;
  photographer_name: string | null;
  internal_note: string | null;
  status: PhotoItemStatus;
  duplicate_of_item_id: string | null;
  duplicate_override: boolean;
  excluded_reason: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
  uploaded_to_gingr_at: string | null;
  uploaded_to_gingr_by: string | null;
  thumbnail_url?: string | null;
  original_url?: string | null;
  dogs?: PhotoUploadDogAssignment[];
  duplicate_info?: {
    previous_batch_name: string | null;
    previous_filename: string | null;
    previous_uploaded_at: string | null;
    previous_status: string | null;
    previous_service_date: string | null;
  } | null;
};

export type PhotoUploadBatch = {
  id: string;
  batch_name: string;
  service_date: string;
  photographer_name: string;
  photographer_user_id: string | null;
  default_yard: string;
  default_category: string;
  internal_note: string | null;
  status: PhotoBatchStatus;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  exported_at: string | null;
  uploaded_to_gingr_at: string | null;
  uploaded_to_gingr_by: string | null;
  uploaded_to_gingr_by_name: string | null;
  archived_at: string | null;
  reopen_reason: string | null;
  counts?: PhotoBatchCounts;
  items?: PhotoUploadItem[];
};

export type PhotoBatchCounts = {
  total: number;
  processing: number;
  needs_dog_assignment: number;
  needs_review: number;
  ready_for_gingr: number;
  included_in_export: number;
  uploaded_to_gingr: number;
  excluded: number;
  failed: number;
};

export type PhotoUploadExport = {
  id: string;
  batch_id: string;
  export_number: number;
  zip_storage_path: string | null;
  total_items: number;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  confirmed_uploaded_at: string | null;
  confirmed_uploaded_by: string | null;
  confirmed_uploaded_by_name: string | null;
  locked_at: string | null;
  zip_url?: string | null;
};

export type PhotoUploadOption = {
  id: string;
  key: string;
  label: string;
  sort_order: number;
  is_active: boolean;
};

export const PHOTO_ITEM_STATUS_LABELS: Record<PhotoItemStatus, string> = {
  processing: "Processing",
  needs_dog_assignment: "Needs Dog Assignment",
  needs_review: "Needs Review",
  ready_for_gingr: "Ready for Gingr",
  included_in_export: "Included in Export",
  uploaded_to_gingr: "Uploaded to Gingr",
  excluded: "Excluded",
  failed: "Failed"
};

export const PHOTO_BATCH_STATUS_LABELS: Record<PhotoBatchStatus, string> = {
  draft: "Draft",
  processing: "Processing",
  needs_review: "Needs Review",
  ready: "Ready",
  exported: "Exported",
  partially_uploaded: "Partially Uploaded",
  uploaded_to_gingr: "Uploaded to Gingr",
  archived: "Archived"
};

export function suggestedBatchName(serviceDate: string, photographer: string) {
  const date = serviceDate || new Date().toISOString().slice(0, 10);
  const name = photographer.trim() || "Photographer";
  return `Fitdog Photos – ${date} – ${name}`;
}

export function getGingrBulkPhotoUrl() {
  const configured = process.env.NEXT_PUBLIC_GINGR_BULK_PHOTO_URL?.trim();
  if (configured) return configured;
  const subdomain = process.env.GINGR_SUBDOMAIN?.trim() || "fitdog";
  return `https://${subdomain}.gingrapp.com`;
}
