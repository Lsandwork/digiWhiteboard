"use client";

import { useCallback, useState } from "react";
import { MARKETING_UPLOAD_CONCURRENCY } from "@/lib/marketing/storage-provider";
import { useToast } from "@/components/admin/ui/ToastProvider";

type UploadItem = {
  file: File;
  progress: number;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
};

export function BulkUploadPanel() {
  const { showToast } = useToast();
  const [items, setItems] = useState<UploadItem[]>([]);
  const [title, setTitle] = useState("");
  const [photoDate, setPhotoDate] = useState("");
  const [activity, setActivity] = useState("");
  const [photographer, setPhotographer] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const addFiles = useCallback((fileList: FileList | File[]) => {
    const next = Array.from(fileList).map((file) => ({ file, progress: 0, status: "pending" as const }));
    setItems((current) => [...current, ...next]);
  }, []);

  async function uploadAll() {
    if (!items.length) {
      showToast("Add files to upload.", "error");
      return;
    }
    setBusy(true);
    try {
      const createResponse = await fetch("/api/marketing/uploads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "create_batch",
          title,
          photoDate: photoDate || null,
          activity,
          photographer,
          tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean)
        })
      });
      const createBody = await createResponse.json();
      if (!createResponse.ok) throw new Error(createBody.error ?? "Unable to create batch.");
      const currentBatchId = createBody.batch.id as string;
      setBatchId(currentBatchId);

      await fetch("/api/marketing/uploads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "start", batchId: currentBatchId, totalFiles: items.length })
      });

      let index = 0;
      async function worker() {
        while (index < items.length) {
          const currentIndex = index;
          index += 1;
          const item = items[currentIndex]!;
          setItems((current) => current.map((entry, i) => (i === currentIndex ? { ...entry, status: "uploading" } : entry)));
          try {
            const signedResponse = await fetch("/api/marketing/uploads", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                action: "signed_url",
                batchId: currentBatchId,
                fileName: item.file.name,
                mimeType: item.file.type,
                fileSize: item.file.size
              })
            });
            const signedBody = await signedResponse.json();
            if (!signedResponse.ok) throw new Error(signedBody.error ?? "Signed URL failed.");

            const uploadResponse = await fetch(signedBody.signed_upload_url, {
              method: "PUT",
              headers: { "content-type": item.file.type },
              body: item.file
            });
            if (!uploadResponse.ok) throw new Error("Storage upload failed.");

            await fetch("/api/marketing/uploads", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                action: "finalize_file",
                batchId: currentBatchId,
                storagePath: signedBody.storage_path,
                fileName: item.file.name,
                mimeType: item.file.type,
                fileSize: item.file.size,
                displayTitle: title || item.file.name,
                photoDate: photoDate || null,
                activity,
                photographer
              })
            });

            setItems((current) => current.map((entry, i) => (i === currentIndex ? { ...entry, status: "done", progress: 100 } : entry)));
          } catch (error) {
            setItems((current) =>
              current.map((entry, i) =>
                i === currentIndex
                  ? { ...entry, status: "error", error: error instanceof Error ? error.message : "Upload failed." }
                  : entry
              )
            );
          }
        }
      }

      await Promise.all(Array.from({ length: MARKETING_UPLOAD_CONCURRENCY }, () => worker()));

      await fetch("/api/marketing/uploads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "complete_batch", batchId: currentBatchId })
      });

      showToast("Upload batch finished.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Upload failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="marketing-grid-2">
      <section className="marketing-card">
        <h2 className="marketing-card__title mb-4">Bulk Photo Upload</h2>
        <div
          className={`marketing-upload-zone ${dragActive ? "marketing-upload-zone--active" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => { e.preventDefault(); setDragActive(false); addFiles(e.dataTransfer.files); }}
        >
          <p className="mb-2 font-semibold">Drag and drop photos or videos</p>
          <p className="mb-3 text-sm text-slate-500">JPEG, PNG, WebP, GIF, MP4, WebM, MOV up to 100MB each</p>
          <label className="marketing-btn marketing-btn--secondary cursor-pointer">
            Choose files
            <input type="file" multiple accept="image/*,video/*" className="hidden" onChange={(e) => e.target.files && addFiles(e.target.files)} />
          </label>
        </div>
        {items.length ? (
          <ul className="mt-4 space-y-2">
            {items.map((item, index) => (
              <li key={`${item.file.name}-${index}`} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span>{item.file.name}</span>
                  <span className="text-sm text-slate-500">{item.status}</span>
                </div>
                {item.error ? <p className="text-sm text-red-600">{item.error}</p> : null}
                <div className="marketing-progress mt-2"><div className="marketing-progress__bar" style={{ width: `${item.progress}%` }} /></div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
      <section className="marketing-card">
        <h2 className="marketing-card__title mb-4">Batch metadata</h2>
        <div className="marketing-form-grid">
          <label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          <label>Photo date<input type="date" value={photoDate} onChange={(e) => setPhotoDate(e.target.value)} /></label>
          <label>Activity<input value={activity} onChange={(e) => setActivity(e.target.value)} /></label>
          <label>Photographer<input value={photographer} onChange={(e) => setPhotographer(e.target.value)} /></label>
          <label>Tags (comma separated)<input value={tags} onChange={(e) => setTags(e.target.value)} /></label>
          <button type="button" className="marketing-btn marketing-btn--primary" disabled={busy} onClick={() => void uploadAll()}>
            {busy ? "Uploading…" : "Start upload"}
          </button>
          {batchId ? <p className="text-sm text-slate-500">Batch ID: {batchId}</p> : null}
        </div>
      </section>
    </div>
  );
}
