"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, RefreshCw, UploadCloud, X } from "lucide-react";
import { PHOTO_UPLOAD_MAX_BYTES } from "@/lib/photo-upload-queue/types";

export type PendingUpload = {
  id: string;
  file: File;
  previewUrl: string;
  progress: number;
  status: "queued" | "uploading" | "done" | "error" | "cancelled";
  error?: string;
  abort?: AbortController;
};

type UploadZoneProps = {
  disabled?: boolean;
  pending: PendingUpload[];
  onFilesSelected: (files: File[]) => void;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
};

const ACCEPT = "image/jpeg,image/jpg,image/png,image/heic,image/heif,image/webp,.heic,.heif";

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadZone({
  disabled,
  pending,
  onFilesSelected,
  onCancel,
  onRetry,
  onRemove
}: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  function handleFiles(list: FileList | File[] | null) {
    if (!list || disabled) return;
    const files = Array.from(list).filter((file) => {
      const mime = (file.type || "").toLowerCase();
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      const allowed =
        mime.startsWith("image/") ||
        ["jpg", "jpeg", "png", "heic", "heif", "webp"].includes(ext);
      return allowed && file.size > 0 && file.size <= PHOTO_UPLOAD_MAX_BYTES;
    });
    if (files.length) onFilesSelected(files);
  }

  return (
    <div className="space-y-4">
      <label
        className={`lobby-slideshow-upload-drop ${dragActive ? "is-drag-active" : ""} ${disabled ? "is-busy" : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setDragActive(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          handleFiles(event.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="sr-only"
          disabled={disabled}
          onChange={(event) => {
            handleFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <div className="lobby-slideshow-upload-drop__icon" aria-hidden>
          <UploadCloud className="h-10 w-10" />
        </div>
        <p className="lobby-slideshow-upload-drop__title">Drag photos here</p>
        <p className="lobby-slideshow-upload-drop__hint">
          JPG, PNG, HEIC, or WEBP · up to {Math.round(PHOTO_UPLOAD_MAX_BYTES / (1024 * 1024))}MB each · multiple files
          supported
        </p>
        <button
          type="button"
          className="admin-btn-primary mt-4 min-h-11"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus className="h-4 w-4" />
          Choose Photos
        </button>
      </label>

      {pending.length ? (
        <ul className="grid gap-3">
          {pending.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-3 rounded-xl border border-admin-border bg-black/15 p-3 sm:flex-row sm:items-center"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.previewUrl} alt="" className="h-16 w-16 rounded-lg object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-white">{item.file.name}</p>
                <p className="text-xs text-admin-muted">{formatBytes(item.file.size)}</p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/30">
                  <div
                    className={`h-full rounded-full transition-all ${
                      item.status === "error"
                        ? "bg-rose-400"
                        : item.status === "done"
                          ? "bg-emerald-400"
                          : "bg-fitdog-orange"
                    }`}
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-admin-muted">
                  {item.status === "queued" && "Queued…"}
                  {item.status === "uploading" && `Uploading… ${item.progress}%`}
                  {item.status === "done" && "Uploaded"}
                  {item.status === "cancelled" && "Cancelled"}
                  {item.status === "error" && (item.error || "Upload failed")}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {item.status === "uploading" || item.status === "queued" ? (
                  <button type="button" className="admin-btn-secondary min-h-11" onClick={() => onCancel(item.id)}>
                    <X className="h-4 w-4" />
                    Cancel
                  </button>
                ) : null}
                {item.status === "error" || item.status === "cancelled" ? (
                  <button type="button" className="admin-btn-secondary min-h-11" onClick={() => onRetry(item.id)}>
                    <RefreshCw className="h-4 w-4" />
                    Retry
                  </button>
                ) : null}
                {item.status !== "uploading" ? (
                  <button type="button" className="admin-btn-secondary min-h-11" onClick={() => onRemove(item.id)}>
                    <X className="h-4 w-4" />
                    Remove
                  </button>
                ) : null}
                {item.status === "uploading" ? <Loader2 className="h-5 w-5 animate-spin text-fitdog-orange" /> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
