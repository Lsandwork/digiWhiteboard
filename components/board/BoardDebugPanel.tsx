import type { LiveBoardResponse } from "@/lib/types";

type BoardDebugPanelProps = {
  endpoint: string;
  fetchStatus: "idle" | "loading" | "ok" | "error";
  lastFetchAt: string | null;
  board: LiveBoardResponse;
  visibleCheckingInCount: number;
  visibleCheckingOutCount: number;
  expiredCheckoutCount: number;
};

export function BoardDebugPanel({
  endpoint,
  fetchStatus,
  lastFetchAt,
  board,
  visibleCheckingInCount,
  visibleCheckingOutCount,
  expiredCheckoutCount
}: BoardDebugPanelProps) {
  return (
    <div className="fixed bottom-4 right-4 z-50 w-[min(420px,calc(100%-2rem))] rounded-2xl border border-slate-600/60 bg-slate-950/95 p-4 text-xs text-slate-200 shadow-2xl backdrop-blur">
      <p className="mb-2 text-sm font-bold text-white">Board Debug</p>
      <dl className="grid gap-1">
        <div className="flex justify-between gap-4">
          <dt className="text-slate-400">API endpoint</dt>
          <dd className="text-right font-mono">{endpoint}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-400">Fetch status</dt>
          <dd>{fetchStatus}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-400">Last fetch</dt>
          <dd>{lastFetchAt ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-400">Raw records</dt>
          <dd>{board.debug?.raw_record_count ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-400">Checking In (API)</dt>
          <dd>{board.counts.checking_in}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-400">Checking Out (API)</dt>
          <dd>{board.counts.checking_out}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-400">Visible Checking In</dt>
          <dd>{visibleCheckingInCount}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-400">Visible Checking Out</dt>
          <dd>{visibleCheckingOutCount}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-400">Expired Checking Out</dt>
          <dd>{expiredCheckoutCount}</dd>
        </div>
      </dl>
      {board.debug?.env ? (
        <div className="mt-3 border-t border-slate-700/70 pt-3">
          <p className="mb-1 font-semibold text-slate-300">Env availability</p>
          <ul className="space-y-0.5">
            {Object.entries(board.debug.env).map(([key, value]) => (
              <li key={key} className="flex justify-between gap-4">
                <span className="text-slate-400">{key}</span>
                <span className={value ? "text-emerald-300" : "text-red-300"}>{value ? "yes" : "no"}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {board.debug?.missing_env?.length ? (
        <p className="mt-2 text-red-300">Missing: {board.debug.missing_env.join(", ")}</p>
      ) : null}
      {board.error ? <p className="mt-2 text-red-300">{board.error}</p> : null}
    </div>
  );
}
