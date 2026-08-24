import { readApiJson } from "@/lib/admin/safe-fetch-json";
import {
  inferCastTvMimeType,
  isHeicCastTvUpload,
  shouldUseCastTvServerUpload
} from "@/lib/cast-tv/mime";

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

const FETCH_INIT: Pick<RequestInit, "credentials"> = { credentials: "include" };

function fileMime(file: File) {
  return inferCastTvMimeType(file.name, file.type);
}

async function uploadViaServer(file: File, displayName?: string) {
  const form = new FormData();
  form.append("file", file);
  if (displayName) form.append("displayName", displayName);
  const response = await fetch("/api/cast-tv/media/upload", {
    ...FETCH_INIT,
    method: "POST",
    body: form
  });
  const body = await readApiJson<UploadCompleteResponse>(response);
  if (!response.ok || !body.media) {
    throw new Error(body.error ?? "Unable to save CAST-TV media.");
  }
  return body.media;
}

async function requestUploadTarget(file: File) {
  const mimeType = fileMime(file);
  const response = await fetch("/api/cast-tv/media/upload-url", {
    ...FETCH_INIT,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      mimeType,
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
    headers: {
      "content-type": mimeType,
      "x-upsert": "false"
    },
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
    ...FETCH_INIT,
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
  const mimeType = fileMime(file);
  if (isHeicCastTvUpload(file.name, mimeType) && !shouldUseCastTvServerUpload(file)) {
    throw new Error("This iPhone photo is too large to convert here. Export it as JPG and try again.");
  }

  if (shouldUseCastTvServerUpload(file)) {
    onProgress?.(25);
    const media = await uploadViaServer(file, displayName);
    onProgress?.(100);
    return media;
  }

  try {
    const target = await requestUploadTarget(file);
    onProgress?.(20);
    await uploadFileToSignedUrl(file, target.signed_upload_url!, target.mime_type ?? mimeType);
    onProgress?.(85);
    const media = await finalizeUpload({
      fileName: file.name,
      mimeType: target.mime_type ?? mimeType,
      fileSize: target.file_size_bytes ?? file.size,
      storagePath: target.storage_path!,
      displayName
    });
    onProgress?.(100);
    return media;
  } catch (error) {
    if (file.size <= 3_500_000) {
      onProgress?.(40);
      const media = await uploadViaServer(file, displayName);
      onProgress?.(100);
      return media;
    }
    throw error;
  }
}

export async function replaceCastTvMedia(
  mediaId: string,
  file: File,
  onProgress?: (pct: number) => void
) {
  onProgress?.(5);
  const mimeType = fileMime(file);

  if (shouldUseCastTvServerUpload(file)) {
    onProgress?.(25);
    const form = new FormData();
    form.append("file", file);
    form.append("replaceId", mediaId);
    const response = await fetch("/api/cast-tv/media/upload", {
      ...FETCH_INIT,
      method: "POST",
      body: form
    });
    const body = await readApiJson<ReplaceCompleteResponse>(response);
    if (!response.ok || !body.media) {
      throw new Error(body.error ?? "Unable to replace CAST-TV media.");
    }
    onProgress?.(100);
    return body.media;
  }

  const target = await requestUploadTarget(file);
  onProgress?.(20);
  await uploadFileToSignedUrl(file, target.signed_upload_url!, target.mime_type ?? mimeType);
  onProgress?.(85);

  const response = await fetch(`/api/cast-tv/media/${mediaId}`, {
    ...FETCH_INIT,
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "replace",
      fileName: file.name,
      mimeType: target.mime_type ?? mimeType,
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
