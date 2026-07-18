"use client";

import { AdminTable } from "@/components/admin/ui/AdminTable";
import { PhotoBatchStatusBadge } from "@/components/admin/photo-upload-queue/StatusBadge";
import type { PhotoBatchStatus, PhotoUploadBatch } from "@/lib/photo-upload-queue/types";
import { PHOTO_BATCH_STATUS_LABELS } from "@/lib/photo-upload-queue/types";

type HistoryFilters = {
  status: string;
  photographer: string;
  service_date_from: string;
  service_date_to: string;
  q: string;
};

type BatchHistoryListProps = {
  batches: PhotoUploadBatch[];
  loading: boolean;
  filters: HistoryFilters;
  onFiltersChange: (filters: HistoryFilters) => void;
  onOpenBatch: (batchId: string) => void;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

export function BatchHistoryList({
  batches,
  loading,
  filters,
  onFiltersChange,
  onOpenBatch
}: BatchHistoryListProps) {
  const statusOptions = Object.entries(PHOTO_BATCH_STATUS_LABELS) as Array<[PhotoBatchStatus, string]>;

  return (
    <section className="crossover-card p-5">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-lg font-bold text-white">Upload History</h3>
          <p className="admin-empty-state-text">Open a batch to continue organizing or transfer photos to Gingr.</p>
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-admin-muted">Status</span>
          <select
            className="admin-input w-full"
            value={filters.status}
            onChange={(e) => onFiltersChange({ ...filters, status: e.target.value })}
          >
            <option value="">All statuses</option>
            {statusOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-admin-muted">Photographer</span>
          <input
            className="admin-input w-full"
            value={filters.photographer}
            onChange={(e) => onFiltersChange({ ...filters, photographer: e.target.value })}
            placeholder="Filter photographer"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-admin-muted">From date</span>
          <input
            type="date"
            className="admin-input w-full"
            value={filters.service_date_from}
            onChange={(e) => onFiltersChange({ ...filters, service_date_from: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-admin-muted">To date</span>
          <input
            type="date"
            className="admin-input w-full"
            value={filters.service_date_to}
            onChange={(e) => onFiltersChange({ ...filters, service_date_to: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-admin-muted">Search</span>
          <input
            className="admin-input w-full"
            value={filters.q}
            onChange={(e) => onFiltersChange({ ...filters, q: e.target.value })}
            placeholder="Batch name or dog"
          />
        </label>
      </div>

      <AdminTable
        loading={loading}
        rows={batches}
        rowKey={(row) => row.id}
        emptyTitle="No batches yet"
        emptyDescription="Create a new batch to start uploading report-card photos."
        columns={[
          {
            key: "name",
            header: "Batch",
            render: (row) => <span className="font-semibold text-white">{row.batch_name}</span>
          },
          {
            key: "service_date",
            header: "Service date",
            render: (row) => formatDate(row.service_date)
          },
          {
            key: "photographer",
            header: "Photographer",
            render: (row) => row.photographer_name || "—"
          },
          {
            key: "counts",
            header: "Photos",
            hideOnMobile: true,
            render: (row) => {
              const counts = row.counts;
              if (!counts) return "—";
              return `${counts.total} · Ready ${counts.ready_for_gingr} · Uploaded ${counts.uploaded_to_gingr}`;
            }
          },
          {
            key: "created",
            header: "Created",
            hideOnMobile: true,
            render: (row) => formatDate(row.created_at)
          },
          {
            key: "exported",
            header: "Exported",
            hideOnMobile: true,
            render: (row) => formatDate(row.exported_at)
          },
          {
            key: "confirmed",
            header: "Gingr confirmed",
            hideOnMobile: true,
            render: (row) => formatDate(row.uploaded_to_gingr_at)
          },
          {
            key: "status",
            header: "Status",
            render: (row) => <PhotoBatchStatusBadge status={row.status} />
          }
        ]}
        actions={(row) => (
          <button type="button" className="admin-btn-secondary min-h-10 px-3 text-xs" onClick={() => onOpenBatch(row.id)}>
            Open
          </button>
        )}
      />
    </section>
  );
}
