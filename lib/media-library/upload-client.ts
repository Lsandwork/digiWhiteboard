import { readApiJson } from "@/lib/admin/safe-fetch-json";
import type { PhotoUploadItem } from "@/lib/photo-upload-queue/types";

type UploadTargetResponse = {
  error?: string;
  batch_id?: string;
  storage_path?: string;
  signed_upload_url?: string;
  mime_type?: string;
  file_size_bytes?: number;
};

type UploadCompleteResponse = {
  error?: string;
  ok?: boolean;
  skipped?: boolean;
  item?: PhotoUploadItem | null;
  duplicate?: unknown;
  message?: string;
};

async function requestUploadTarget(input: {
  fileName: string;
  mimeType: string;
  fileSize: number;
  batchId?: string;
  kind: "video" | "poster";
}) {
  const response = await fetch("/api/admin/media-library/upload-url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  const body = await readApiJson<UploadTargetResponse>(response);
  if (!response.ok || !body.signed_upload_url || !body.storage_path) {
    throw new Error(body.error ?? "Unable to prepare media upload.");
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

async function finalizeVideoUpload(input: {
  batchId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  storagePath: string;
  posterStoragePath?: string | null;
  durationSeconds?: number | null;
}) {
  const response = await fetch("/api/admin/media-library/upload-complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  const body = await readApiJson<UploadCompleteResponse>(response);
  if (!response.ok) {
    throw new Error(body.error ?? "Unable to finalize media upload.");
  }
  if (body.skipped) {
    return {
      ok: true,
      skipped: true as const,
      item: null,
      duplicate: body.duplicate ?? null,
      message: body.message || "Skipped duplicate video."
    };
  }
  if (!body.item) {
    throw new Error(body.error ?? "Unable to finalize media upload.");
  }
  return {
    ok: true,
    skipped: false as const,
    item: body.item,
    duplicate: null,
    message: undefined
  };
}

function isVideoFile(file: File) {
  const mime = (file.type || "").toLowerCase();
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return mime.startsWith("video/") || ["mp4", "webm", "mov"].includes(ext);
}

async function captureVideoPoster(file: File): Promise<{ blob: Blob; duration: number | null } | null> {
  if (typeof document === "undefined") return null;
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = url;

    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("Unable to read video for preview."));
      window.setTimeout(() => reject(new Error("Video preview timed out.")), 15000);
    });

    const duration = Number.isFinite(video.duration) ? video.duration : null;
    video.currentTime = Math.min(1, Math.max(0, (duration ?? 1) * 0.1));

    await new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve();
      video.onerror = () => reject(new Error("Unable to seek video for preview."));
      window.setTimeout(() => resolve(), 3000);
    });

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, video.videoWidth || 640);
    canvas.height = Math.max(1, video.videoHeight || 360);
    const ctx = canvas.getContext("2d");
    if (!ctx) return { blob: new Blob(), duration };
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((value) => resolve(value), "image/jpeg", 0.82);
    });
    if (!blob) return { blob: new Blob(), duration };
    return { blob, duration };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function uploadMediaVideoDirect(file: File, batchId?: string) {
  const target = await requestUploadTarget({
    fileName: file.name,
    mimeType: file.type || "video/mp4",
    fileSize: file.size,
    batchId,
    kind: "video"
  });

  await uploadFileToSignedUrl(file, target.signed_upload_url!, target.mime_type ?? file.type);

  let posterStoragePath: string | null = null;
  let durationSeconds: number | null = null;
  const poster = await captureVideoPoster(file);
  if (poster?.blob.size) {
    durationSeconds = poster.duration;
    const posterTarget = await requestUploadTarget({
      fileName: `${file.name.replace(/\.[^.]+$/, "")}-poster.jpg`,
      mimeType: "image/jpeg",
      fileSize: poster.blob.size,
      batchId: target.batch_id,
      kind: "poster"
    });
    await uploadFileToSignedUrl(
      poster.blob,
      posterTarget.signed_upload_url!,
      posterTarget.mime_type ?? "image/jpeg"
    );
    posterStoragePath = posterTarget.storage_path ?? null;
  }

  return finalizeVideoUpload({
    batchId: target.batch_id!,
    fileName: file.name,
    mimeType: target.mime_type ?? file.type,
    fileSize: target.file_size_bytes ?? file.size,
    storagePath: target.storage_path!,
    posterStoragePath,
    durationSeconds
  });
}

export { isVideoFile };
