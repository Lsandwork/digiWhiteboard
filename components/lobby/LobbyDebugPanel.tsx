import type { LobbyCheckoutDebug, LobbyCheckoutsResponse } from "@/lib/lobby/types";

type LobbyDebugPanelProps = {
  fastEndpoint: string;
  fullEndpoint: string;
  lastFastFetchAt: string | null;
  lastFullFetchAt: string | null;
  fastDebug?: LobbyCheckoutDebug;
  fullDebug?: LobbyCheckoutDebug;
  checkouts: LobbyCheckoutsResponse;
  visibleCheckoutCount: number;
  checkoutPollMs: number;
};

export function LobbyDebugPanel({
  fastEndpoint,
  fullEndpoint,
  lastFastFetchAt,
  lastFullFetchAt,
  fastDebug,
  fullDebug,
  checkouts,
  visibleCheckoutCount,
  checkoutPollMs
}: LobbyDebugPanelProps) {
  return (
    <div className="fixed bottom-4 right-4 z-50 w-[min(420px,calc(100%-2rem))] rounded-2xl border border-slate-600/60 bg-slate-950/95 p-4 text-xs text-slate-200 shadow-2xl backdrop-blur">
      <p className="mb-2 text-sm font-bold text-white">Lobby Board Debug</p>
      <dl className="grid gap-1">
        <div className="flex justify-between gap-4">
          <dt className="text-slate-400">Fast endpoint</dt>
          <dd className="text-right font-mono">{fastEndpoint}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-400">Full endpoint</dt>
          <dd className="text-right font-mono">{fullEndpoint}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-400">Checkout poll</dt>
          <dd>{checkoutPollMs}ms</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-400">Last fast fetch</dt>
          <dd>{lastFastFetchAt ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-400">Last full fetch</dt>
          <dd>{lastFullFetchAt ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-400">Fast data source</dt>
          <dd className="text-right">{fastDebug?.data_source ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-400">Full data source</dt>
          <dd className="text-right">{fullDebug?.data_source ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-400">Fast request</dt>
          <dd>{fastDebug?.request_duration_ms != null ? `${fastDebug.request_duration_ms}ms` : "—"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-400">Full request</dt>
          <dd>{fullDebug?.request_duration_ms != null ? `${fullDebug.request_duration_ms}ms` : "—"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-400">Newest checkout</dt>
          <dd>{fastDebug?.newest_checkout_event_at ?? fullDebug?.newest_checkout_event_at ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-400">Cached Gingr (full)</dt>
          <dd>{fullDebug?.used_cached_gingr == null ? "—" : fullDebug.used_cached_gingr ? "yes" : "no"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-400">Active checkouts (API)</dt>
          <dd>{checkouts.counts.active}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-400">Visible checkouts</dt>
          <dd>{visibleCheckoutCount}</dd>
        </div>
      </dl>
      {checkouts.error ? <p className="mt-2 text-red-300">{checkouts.error}</p> : null}
    </div>
  );
}
