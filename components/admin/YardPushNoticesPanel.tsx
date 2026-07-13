"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { MonitorPlay, Send, Video, XCircle } from "lucide-react";
import { useToast } from "@/components/admin/ui/ToastProvider";
import { canUseYardPush, type UserAccess } from "@/lib/admin/permissions";
import type { CastVideoNotice } from "@/lib/staff/cast-video-notices";
import {
  yardPushSideFromNotice,
  yardPushSideLabel,
  type YardPushSide,
  YARD_PUSH_SIDE_OPTIONS
} from "@/lib/staff/yard-push-notices";
import { YARD_LINK_FEEDS } from "@/lib/yard-links/config";
import { youtubeThumbnailUrl } from "@/lib/yard-links/youtube";

type YardPushPayload = {
  activeNotice: CastVideoNotice | null;
  currentUser: {
    email: string | null;
    role: string | null;
    access?: UserAccess | null;
  };
};

function feedForOption(feedTitle: string) {
  return YARD_LINK_FEEDS.find((feed) => feed.title === feedTitle);
}

export function YardPushNoticesPanel() {
  const { showToast } = useToast();
  const [data, setData] = useState<YardPushPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/yard-push-notices", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load yard push notices.");
      setData(body as YardPushPayload);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to load yard push notices.", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const canPush = useMemo(() => {
    if (!data) return false;
    return canUseYardPush(data.currentUser.access ?? null, data.currentUser.role);
  }, [data]);

  const activeSide = data?.activeNotice ? yardPushSideFromNotice(data.activeNotice) : null;
  const activeSideLabel = yardPushSideLabel(activeSide);

  async function mutate(label: string, request: () => Promise<Response>, successMessage: string) {
    setBusy(true);
    try {
      const response = await request();
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? label);
      showToast(body.message ?? successMessage, "success");
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : label, "error");
    } finally {
      setBusy(false);
    }
  }

  async function pushSide(side: YardPushSide, label: string) {
    await mutate(
      `Unable to push ${label} yard camera.`,
      () =>
        fetch("/api/admin/yard-push-notices", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "push", side })
        }),
      `${label} yard camera pushed to the Staff Digital Whiteboard.`
    );
  }

  async function clearActive() {
    await mutate(
      "Unable to clear yard push notice.",
      () =>
        fetch("/api/admin/yard-push-notices", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "clear" })
        }),
      "Yard push notice cleared."
    );
  }

  return (
    <div className="crossover-dashboard crossover-dashboard__layout space-y-5">
      <header className="crossover-dashboard__page-header">
        <div className="flex items-start gap-3">
          <div className="crossover-icon-tile h-12 w-12 text-sky-300">
            <MonitorPlay className="h-6 w-6" aria-hidden />
          </div>
          <div>
            <h2 className="crossover-dashboard__page-title">Yard Push Notices</h2>
            <p className="crossover-dashboard__page-subtitle">
              Push the live yard camera feeds from Video Links to the Staff Digital Whiteboard cast screen.
            </p>
          </div>
        </div>
        {loading ? <span className="admin-badge">Loading…</span> : null}
      </header>

      {data?.activeNotice ? (
        <section className="crossover-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-admin-muted">Currently casting</p>
              <h3 className="mt-1 text-xl font-black text-white">{activeSideLabel ?? data.activeNotice.title}</h3>
              <p className="mt-1 text-sm text-admin-muted">Live on the Staff Digital Whiteboard until cleared.</p>
            </div>
            <button
              type="button"
              className="crossover-btn crossover-btn--outline inline-flex items-center gap-2"
              disabled={busy || !canPush}
              onClick={() => void clearActive()}
            >
              <XCircle className="h-4 w-4" />
              Clear Yard Cast
            </button>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-admin-border bg-white/[0.03] p-5 text-sm text-admin-muted">
          No yard camera is currently casting to the whiteboard.
        </section>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {YARD_PUSH_SIDE_OPTIONS.map((side) => {
          const feed = feedForOption(side.feedTitle);
          const thumbnail = feed ? youtubeThumbnailUrl(feed.videoId) : null;
          const isActive = activeSide === side.id;

          return (
            <article key={side.id} className="crossover-card p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="crossover-card__title">{side.label}</h3>
                  <p className="crossover-card__subtitle">{side.description}</p>
                </div>
                {isActive ? <span className="crossover-badge">Live</span> : null}
              </div>

              <div className="yard-push-card__preview mb-4 overflow-hidden rounded-2xl border border-admin-border bg-black/30">
                {thumbnail ? (
                  <Image
                    src={thumbnail}
                    alt={`${side.label} yard camera preview`}
                    width={640}
                    height={360}
                    className="h-48 w-full object-cover"
                  />
                ) : (
                  <div className="grid h-48 place-items-center text-admin-muted">
                    <Video className="h-10 w-10" aria-hidden />
                  </div>
                )}
              </div>

              <button
                type="button"
                className="crossover-btn crossover-btn--primary inline-flex w-full items-center justify-center gap-2"
                disabled={busy || !canPush || isActive}
                onClick={() => void pushSide(side.id, side.label)}
              >
                <Send className="h-4 w-4" />
                {isActive ? `${side.label} is live` : `Push ${side.label}`}
              </button>
            </article>
          );
        })}
      </div>

      {!canPush ? (
        <p className="admin-error">You do not have permission to push yard camera notices.</p>
      ) : null}
    </div>
  );
}
