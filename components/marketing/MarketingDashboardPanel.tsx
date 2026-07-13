"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MARKETING_DESTINATION_LABELS, MARKETING_REQUEST_TYPE_LABELS, MARKETING_ROUTES } from "@/lib/marketing/constants";
import { MarketingStatusBadge } from "@/components/marketing/MarketingStatusBadge";

type DashboardData = {
  kpis: {
    activeRequests: number;
    dogsInPhotoBox: number;
    awaitingHandler: number;
    uploadsProcessing: number;
    photosNeedingReview: number;
    storageUsedPercent: number;
  };
  activeRequests: Array<Record<string, unknown>>;
  dogsInPhotoBoxList: Array<Record<string, unknown>>;
  recentUploads: Array<Record<string, unknown>>;
  upcomingContent: Array<Record<string, unknown>>;
  notifications: Array<Record<string, unknown>>;
  storageBreakdown: { photos: number; videos: number; other: number };
};

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function MarketingDashboardPanel() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/marketing/dashboard", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load dashboard.");
      setData(body as DashboardData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const kpis = useMemo(
    () =>
      data
        ? [
            { label: "Active Requests", value: data.kpis.activeRequests },
            { label: "Dogs in Photo Box", value: data.kpis.dogsInPhotoBox },
            { label: "Awaiting Handler", value: data.kpis.awaitingHandler },
            { label: "Uploads Processing", value: data.kpis.uploadsProcessing },
            { label: "Photos Needing Review", value: data.kpis.photosNeedingReview },
            { label: "Storage Used", value: `${data.kpis.storageUsedPercent}%` }
          ]
        : [],
    [data]
  );

  if (loading) return <div className="marketing-empty">Loading dashboard…</div>;
  if (error) return <div className="marketing-empty">{error}</div>;
  if (!data) return <div className="marketing-empty">No dashboard data.</div>;

  return (
    <div className="marketing-dashboard">
      <p className="mb-4 text-sm text-slate-600">
        Good morning! Here&apos;s what&apos;s happening with your media today.
      </p>
      <section className="marketing-kpi-grid" aria-label="Marketing KPIs">
        {kpis.map((kpi) => (
          <article key={kpi.label} className="marketing-kpi">
            <p className="marketing-kpi__value">{kpi.value}</p>
            <p className="marketing-kpi__label">{kpi.label}</p>
          </article>
        ))}
      </section>

      <div className="marketing-grid-2">
        <section className="marketing-card">
          <div className="marketing-card__header">
            <h2 className="marketing-card__title">Active Media Requests</h2>
            <Link href={MARKETING_ROUTES.requests}>View all</Link>
          </div>
          {data.activeRequests.length ? (
            <table className="marketing-table">
              <thead>
                <tr>
                  <th>Dog</th>
                  <th>Type</th>
                  <th>Destination</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.activeRequests.map((row) => (
                  <tr key={String(row.id)}>
                    <td>{String(row.dog_name)}</td>
                    <td>{MARKETING_REQUEST_TYPE_LABELS[row.request_type as keyof typeof MARKETING_REQUEST_TYPE_LABELS] ?? String(row.request_type)}</td>
                    <td>{MARKETING_DESTINATION_LABELS[row.destination as keyof typeof MARKETING_DESTINATION_LABELS] ?? String(row.destination)}</td>
                    <td><MarketingStatusBadge status={String(row.status)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="marketing-empty">No active requests.</div>
          )}
        </section>

        <section className="marketing-card">
          <div className="marketing-card__header">
            <h2 className="marketing-card__title">Dogs in Photo Box</h2>
          </div>
          {data.dogsInPhotoBoxList.length ? (
            <ul>
              {data.dogsInPhotoBoxList.map((row) => (
                <li key={String(row.id)} className="mb-2 flex items-center justify-between gap-2">
                  <span>{String(row.dog_name)}</span>
                  <MarketingStatusBadge status={String(row.status)} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="marketing-empty">No dogs in the photo box.</div>
          )}
        </section>

        <section className="marketing-card">
          <div className="marketing-card__header">
            <h2 className="marketing-card__title">Recent Uploads</h2>
            <Link href={MARKETING_ROUTES.upload}>View all</Link>
          </div>
          {data.recentUploads.length ? (
            <ul>
              {data.recentUploads.map((batch) => (
                <li key={String(batch.id)} className="mb-2">
                  <strong>{String(batch.title ?? "Untitled batch")}</strong>
                  <div className="text-sm text-slate-500">
                    {Number(batch.completed_files ?? 0)}/{Number(batch.total_files ?? 0)} files · {String(batch.status)}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="marketing-empty">No recent uploads.</div>
          )}
        </section>

        <section className="marketing-card">
          <div className="marketing-card__header">
            <h2 className="marketing-card__title">Upcoming Content</h2>
            <Link href={MARKETING_ROUTES.calendar}>View calendar</Link>
          </div>
          {data.upcomingContent.length ? (
            <ul>
              {data.upcomingContent.map((event) => (
                <li key={String(event.id)} className="mb-2">
                  <strong>{String(event.title)}</strong>
                  <div className="text-sm text-slate-500">{new Date(String(event.starts_at)).toLocaleString()}</div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="marketing-empty">No upcoming events.</div>
          )}
        </section>

        <section className="marketing-card">
          <div className="marketing-card__header">
            <h2 className="marketing-card__title">Marketing Notifications</h2>
            <Link href={MARKETING_ROUTES.notifications}>View all</Link>
          </div>
          {data.notifications.length ? (
            <ul>
              {data.notifications.map((note) => (
                <li key={String(note.id)} className="mb-2">
                  <strong>{String(note.title)}</strong>
                  <div className="text-sm text-slate-500">{String(note.body ?? "")}</div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="marketing-empty">You&apos;re all caught up.</div>
          )}
        </section>

        <section className="marketing-card">
          <div className="marketing-card__header">
            <h2 className="marketing-card__title">Storage Overview</h2>
            <Link href={MARKETING_ROUTES.storage}>Open library</Link>
          </div>
          <p className="mb-2 text-2xl font-bold text-violet-700">{data.kpis.storageUsedPercent}% used</p>
          <ul className="text-sm text-slate-600">
            <li>Photos: {formatBytes(data.storageBreakdown.photos)}</li>
            <li>Videos: {formatBytes(data.storageBreakdown.videos)}</li>
            <li>Other: {formatBytes(data.storageBreakdown.other)}</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
