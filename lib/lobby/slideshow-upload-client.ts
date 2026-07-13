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
  upload?: {
    id: string;
    title: string;
    media_type: "image" | "video";
    media_url: string;
  };
};

async function requestUploadTarget(file: File) {
  const response = await fetch("/api/admin/lobby-slideshow/upload-url", {
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
    throw new Error(body.error ?? "Unable to prepare slideshow upload.");
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
  title?: string;
}) {
  const response = await fetch("/api/admin/lobby-slideshow/upload-complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      fileName: input.fileName,
      mimeType: input.mimeType,
      fileSize: input.fileSize,
      storagePath: input.storagePath,
      title: input.title
    })
  });
  const body = await readApiJson<UploadCompleteResponse>(response);
  if (!response.ok || !body.upload) {
    throw new Error(body.error ?? "Unable to save slideshow upload.");
  }
  return body.upload;
}

export async function uploadLobbySlideshowMedia(file: File, title?: string) {
  const target = await requestUploadTarget(file);
  await uploadFileToSignedUrl(file, target.signed_upload_url!, target.mime_type ?? file.type);
  return finalizeUpload({
    fileName: file.name,
    mimeType: target.mime_type ?? file.type,
    fileSize: target.file_size_bytes ?? file.size,
    storagePath: target.storage_path!,
    title
  });
}
