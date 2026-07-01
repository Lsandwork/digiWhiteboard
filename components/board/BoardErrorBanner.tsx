import { AlertTriangle, RefreshCw } from "lucide-react";
import { formatBoardTime } from "@/lib/board-utils";

type BoardErrorBannerProps = {
  message: string;
  lastSuccessAt: string | null;
  onRetry: () => void;
  devDetail?: string | null;
};

export function BoardErrorBanner({ message, lastSuccessAt, onRetry, devDetail }: BoardErrorBannerProps) {
  return (
    <div className="mb-4 rounded-2xl border border-red-400/40 bg-red-950/50 px-4 py-4 shadow-lg backdrop-blur sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-red-300" />
          <div className="min-w-0">
            <p className="text-lg font-bold text-white sm:text-xl">{message}</p>
            {lastSuccessAt ? (
              <p className="mt-1 text-sm text-red-100/80">Last successful update {formatBoardTime(lastSuccessAt)}</p>
            ) : null}
            {devDetail ? (
              <p className="mt-2 text-xs text-red-100/70">{devDetail}</p>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 rounded-xl border border-red-300/40 bg-red-400/10 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-400/20"
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
      </div>
    </div>
  );
}
