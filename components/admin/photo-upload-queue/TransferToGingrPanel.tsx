"use client";

import { Download, ExternalLink } from "lucide-react";
import type { PhotoUploadBatch, PhotoUploadExport } from "@/lib/photo-upload-queue/types";

type TransferToGingrPanelProps = {
  batch: PhotoUploadBatch;
  latestExport: PhotoUploadExport | null;
  gingrUrl: string;
  onMarkUploaded: () => void;
  disabled?: boolean;
};

export function TransferToGingrPanel({
  batch,
  latestExport,
  gingrUrl,
  onMarkUploaded,
  disabled
}: TransferToGingrPanelProps) {
  const downloadUrl = latestExport?.zip_url ?? null;
  const photoCount = latestExport?.total_items ?? batch.counts?.included_in_export ?? batch.counts?.total ?? 0;

  return (
    <section className="crossover-card border border-violet-400/25 p-5">
      <h3 className="admin-page-title text-lg">Transfer Photos to Gingr</h3>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-admin-muted">
        <li>Download the prepared photo batch.</li>
        <li>Open Gingr’s Bulk Photo Upload page.</li>
        <li>Drag the downloaded photos into Gingr.</li>
        <li>Complete dog tagging or confirmation in Gingr.</li>
        <li>Return here and mark the batch as uploaded.</li>
      </ol>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {downloadUrl ? (
          <a href={downloadUrl} className="admin-btn-primary min-h-11" download>
            <Download className="h-4 w-4" />
            Download prepared photos ({photoCount})
          </a>
        ) : (
          <p className="admin-empty-state-text">Download link unavailable. Re-run Prepare Gingr Upload if needed.</p>
        )}
        <a
          href={gingrUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="admin-btn-secondary min-h-11"
        >
          <ExternalLink className="h-4 w-4" />
          Open Gingr Bulk Photo Upload
        </a>
        <button
          type="button"
          className="admin-btn-primary min-h-11"
          onClick={onMarkUploaded}
          disabled={disabled || batch.status === "uploaded_to_gingr"}
        >
          Mark as Uploaded to Gingr
        </button>
      </div>
    </section>
  );
}
