import { readApiJson } from "@/lib/admin/safe-fetch-json";

type UploadTargetResponse = {
  error?: string;
  storage_path?: string;
  signed_upload_url?: string;
  mime_type?: string;
  file_size_bytes?: number;
  media_type?: "image" | "video";
};

type UploadCompleteResponse = {
  error?: string;
  media?: {
    id: string;
    display_name: string | null;
    media_type: "image" | "video";
    public_url: string | null;
  };
};

type ReplaceCompleteResponse = UploadCompleteResponse;

async function requestUploadTarget(file: File) {
  const response = await fetch("/api/cast-tv/media/upload-url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size
    })
  });
  const body = await readApiJson<UploadTargetResponse>(response);
  if (!response.ok || !body.signed_upload_url || !body.storage_path) {
    throw new Error(body.error ?? "Unable to prepare CAST-TV upload.");
  }
  return body;
}

async function uploadFileToSignedUrl(file: File, signedUrl: string, mimeType: string) {
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
  fileName: string;
  mimeType: string;
  fileSize: number;
  storagePath: string;
  displayName?: string;
}) {
  const response = await fetch("/api/cast-tv/media/upload-complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      fileName: input.fileName,
      mimeType: input.mimeType,
      fileSize: input.fileSize,
      storagePath: input.storagePath,
      displayName: input.displayName
    })
  });
  const body = await readApiJson<UploadCompleteResponse>(response);
  if (!response.ok || !body.media) {
    throw new Error(body.error ?? "Unable to save CAST-TV media.");
  }
  return body.media;
}

export async function uploadCastTvMedia(file: File, displayName?: string, onProgress?: (pct: number) => void) {
  onProgress?.(5);
  const target = await requestUploadTarget(file);
  onProgress?.(20);
  await uploadFileToSignedUrl(file, target.signed_upload_url!, target.mime_type ?? file.type);
  onProgress?.(85);
  const media = await finalizeUpload({
    fileName: file.name,
    mimeType: target.mime_type ?? file.type,
    fileSize: target.file_size_bytes ?? file.size,
    storagePath: target.storage_path!,
    displayName
  });
  onProgress?.(100);
  return media;
}

export async function replaceCastTvMedia(
  mediaId: string,
  file: File,
  onProgress?: (pct: number) => void
) {
  onProgress?.(5);
  const target = await requestUploadTarget(file);
  onProgress?.(20);
  await uploadFileToSignedUrl(file, target.signed_upload_url!, target.mime_type ?? file.type);
  onProgress?.(85);

  const response = await fetch(`/api/cast-tv/media/${mediaId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "replace",
      fileName: file.name,
      mimeType: target.mime_type ?? file.type,
      fileSize: target.file_size_bytes ?? file.size,
      storagePath: target.storage_path
    })
  });
  const body = await readApiJson<ReplaceCompleteResponse>(response);
  if (!response.ok || !body.media) {
    throw new Error(body.error ?? "Unable to replace CAST-TV media.");
  }
  onProgress?.(100);
  return body.media;
}
