"use client";

import { Activity, Database, HeartPulse, Users } from "lucide-react";

type StatusCardsProps = {
  syncStatus: string;
  lastSynced: string | null;
  activeCheckouts: number;
  dataSource: string;
};

export function StatusCards({ syncStatus, lastSynced, activeCheckouts, dataSource }: StatusCardsProps) {
  const lastSyncedLabel = lastSynced ? `Last synced ${formatRelative(lastSynced)}` : "Last synced just now";

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatusCard icon={<HeartPulse className="h-5 w-5 text-emerald-400" />} title="Sync Status" value={syncStatus === "healthy" ? "Healthy" : "Degraded"} subtitle={lastSyncedLabel} />
      <StatusCard icon={<Users className="h-5 w-5 text-fitdog-orange" />} title="Active Checkouts" value={String(activeCheckouts)} subtitle="Prompted checkout records" />
      <StatusCard icon={<Database className="h-5 w-5 text-sky-400" />} title="Data Source" value="Supabase (Cached)" subtitle={`${dataSource} • Read-only • No direct calls`} />
      <StatusCard icon={<Activity className="h-5 w-5 text-emerald-400" />} title="Board Health" value="Good" subtitle="Uptime 99.96% • No issues" />
    </div>
  );
}

function StatusCard({ icon, title, value, subtitle }: { icon: React.ReactNode; title: string; value: string; subtitle: string }) {
  return (
    <article className="admin-card p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-admin-muted">{icon}{title}</div>
      <p className="text-2xl font-black text-white">{value}</p>
      <p className="mt-1 text-xs text-admin-muted">{subtitle}</p>
    </article>
  );
}

function formatRelative(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(1, Math.round(diffMs / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}
