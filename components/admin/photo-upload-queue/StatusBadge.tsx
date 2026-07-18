import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  CircleDashed,
  CloudUpload,
  Loader2,
  Package,
  PawPrint,
  ScanSearch,
  XCircle
} from "lucide-react";
import {
  PHOTO_BATCH_STATUS_LABELS,
  PHOTO_ITEM_STATUS_LABELS,
  type PhotoBatchStatus,
  type PhotoItemStatus
} from "@/lib/photo-upload-queue/types";

const ITEM_ICONS: Record<PhotoItemStatus, typeof Loader2> = {
  processing: Loader2,
  needs_dog_assignment: PawPrint,
  needs_review: ScanSearch,
  ready_for_gingr: CheckCircle2,
  included_in_export: Package,
  uploaded_to_gingr: CloudUpload,
  excluded: Ban,
  failed: XCircle
};

const ITEM_TONES: Record<PhotoItemStatus, string> = {
  processing: "text-sky-300 bg-sky-500/15 border-sky-400/30",
  needs_dog_assignment: "text-amber-200 bg-amber-500/15 border-amber-400/35",
  needs_review: "text-orange-200 bg-orange-500/15 border-orange-400/35",
  ready_for_gingr: "text-emerald-200 bg-emerald-500/15 border-emerald-400/35",
  included_in_export: "text-violet-200 bg-violet-500/15 border-violet-400/35",
  uploaded_to_gingr: "text-teal-200 bg-teal-500/15 border-teal-400/35",
  excluded: "text-slate-300 bg-slate-500/15 border-slate-400/30",
  failed: "text-rose-200 bg-rose-500/15 border-rose-400/35"
};

const BATCH_TONES: Record<PhotoBatchStatus, string> = {
  draft: "text-slate-200 bg-slate-500/15 border-slate-400/30",
  processing: "text-sky-300 bg-sky-500/15 border-sky-400/30",
  needs_review: "text-orange-200 bg-orange-500/15 border-orange-400/35",
  ready: "text-emerald-200 bg-emerald-500/15 border-emerald-400/35",
  exported: "text-violet-200 bg-violet-500/15 border-violet-400/35",
  partially_uploaded: "text-amber-200 bg-amber-500/15 border-amber-400/35",
  uploaded_to_gingr: "text-teal-200 bg-teal-500/15 border-teal-400/35",
  archived: "text-slate-400 bg-slate-600/20 border-slate-500/30"
};

export function PhotoItemStatusBadge({ status }: { status: PhotoItemStatus }) {
  const Icon = ITEM_ICONS[status] ?? CircleDashed;
  const spinning = status === "processing";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold ${ITEM_TONES[status] ?? ITEM_TONES.needs_review}`}
    >
      <Icon className={`h-3.5 w-3.5 shrink-0 ${spinning ? "animate-spin" : ""}`} aria-hidden />
      <span>{PHOTO_ITEM_STATUS_LABELS[status] ?? status}</span>
    </span>
  );
}

export function PhotoBatchStatusBadge({ status }: { status: PhotoBatchStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold ${BATCH_TONES[status] ?? BATCH_TONES.draft}`}
    >
      <CircleDashed className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{PHOTO_BATCH_STATUS_LABELS[status] ?? status}</span>
    </span>
  );
}

export function DuplicateWarningBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/15 px-2 py-1 text-[11px] font-semibold text-amber-100">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
      Possible duplicate found.
    </span>
  );
}
