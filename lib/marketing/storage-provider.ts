export const MARKETING_MEDIA_BUCKET = "marketing-media";
export const MARKETING_MAX_FILE_BYTES = 100 * 1024 * 1024;
export const MARKETING_MAX_BATCH_FILES = 50;
export const MARKETING_UPLOAD_CONCURRENCY = 3;

export const MARKETING_ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime"
]);

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

function sanitizeFileName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);
}

export function validateMarketingUpload(file: { name: string; type: string; size: number }) {
  if (!MARKETING_ALLOWED_MIME.has(file.type)) {
    throw new Error("Unsupported file type. Use JPEG, PNG, WebP, GIF, MP4, WebM, or MOV.");
  }
  if (file.size > MARKETING_MAX_FILE_BYTES) {
    throw new Error("File exceeds 100MB limit.");
  }
}

export function buildMarketingStoragePath(batchId: string, fileName: string) {
  const ext = fileName.split(".").pop() || "bin";
  return `${batchId}/${Date.now()}-${sanitizeFileName(fileName || `upload.${ext}`)}`;
}

export async function createMarketingSignedUpload(
  supabase: SupabaseClient,
  input: { batchId: string; fileName: string; mimeType: string; fileSize: number }
) {
  validateMarketingUpload({ name: input.fileName, type: input.mimeType, size: input.fileSize });
  const storagePath = buildMarketingStoragePath(input.batchId, input.fileName);
  const { data, error } = await supabase.storage.from(MARKETING_MEDIA_BUCKET).createSignedUploadUrl(storagePath);
  if (error || !data?.signedUrl) throw new Error(error?.message || "Unable to prepare upload.");
  return { storage_path: storagePath, signed_upload_url: data.signedUrl, token: data.token };
}

export async function createMarketingSignedDownload(supabase: SupabaseClient, storagePath: string, expiresIn = 3600) {
  const { data, error } = await supabase.storage.from(MARKETING_MEDIA_BUCKET).createSignedUrl(storagePath, expiresIn);
  if (error || !data?.signedUrl) throw new Error(error?.message || "Unable to create download link.");
  return data.signedUrl;
}

export async function deleteMarketingStorageObject(supabase: SupabaseClient, storagePath: string) {
  const { error } = await supabase.storage.from(MARKETING_MEDIA_BUCKET).remove([storagePath]);
  if (error) throw new Error(error.message);
}
