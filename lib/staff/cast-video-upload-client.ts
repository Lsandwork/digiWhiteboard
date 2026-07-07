import { readApiJson } from "@/lib/admin/safe-fetch-json";

type UploadTargetResponse = {
  error?: string;
  storage_path?: string;
  signed_upload_url?: string;
  mime_type?: string;
  file_size_bytes?: number;
};

type UploadCompleteResponse = {
  error?: string;
  video_storage_path?: string;
  video_url?: string;
  thumbnail_storage_path?: string;
  thumbnail_url?: string;
  mime_type?: string;
  file_size_bytes?: number;
};

async function requestUploadTarget(input: {
  fileName: string;
  mimeType: string;
  fileSize: number;
  kind: "video" | "thumbnail";
  noticeId?: string;
}) {
  const response = await fetch("/api/admin/cast-videos/upload-url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  const body = await readApiJson<UploadTargetResponse>(response);
  if (!response.ok || !body.signed_upload_url || !body.storage_path) {
    throw new Error(body.error ?? "Unable to prepare video upload.");
  }
  return body;
}

async function uploadFileToSignedUrl(file: File | Blob, signedUrl: string, mimeType: string) {
  const response = await fetch(signedUrl, {
    method: "PUT",
    headers: { "content-type": mimeType },
    body: file
  });

  if (!response.ok) {
    const preview = (await response.text()).slice(0, 120).trim();
    throw new Error(preview || `Storage upload failed (${response.status}).`);
  }
}

async function finalizeUpload(input: {
  storagePath: string;
  mimeType: string;
  fileSize: number;
  kind: "video" | "thumbnail";
}) {
  const response = await fetch("/api/admin/cast-videos/upload-complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  const body = await readApiJson<UploadCompleteResponse>(response);
  if (!response.ok) {
    throw new Error(body.error ?? "Unable to finalize video upload.");
  }
  return body;
}

export async function uploadCastVideoDirect(file: File, noticeId?: string) {
  const target = await requestUploadTarget({
    fileName: file.name,
    mimeType: file.type,
    fileSize: file.size,
    kind: "video",
    noticeId
  });

  await uploadFileToSignedUrl(file, target.signed_upload_url!, target.mime_type ?? file.type);

  return finalizeUpload({
    storagePath: target.storage_path!,
    mimeType: target.mime_type ?? file.type,
    fileSize: target.file_size_bytes ?? file.size,
    kind: "video"
  });
}

export async function uploadCastThumbnailDirect(file: File, noticeId?: string) {
  const target = await requestUploadTarget({
    fileName: file.name,
    mimeType: file.type,
    fileSize: file.size,
    kind: "thumbnail",
    noticeId
  });

  await uploadFileToSignedUrl(file, target.signed_upload_url!, target.mime_type ?? file.type);

  return finalizeUpload({
    storagePath: target.storage_path!,
    mimeType: target.mime_type ?? file.type,
    fileSize: target.file_size_bytes ?? file.size,
    kind: "thumbnail"
  });
}
