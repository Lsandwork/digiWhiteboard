"use client";

import type { OpsDogStatusValue } from "@/lib/ops-command-center/types";

const STATUS_TONES: Record<string, string> = {
  expected: "bg-slate-500/20 text-slate-200 border-slate-400/30",
  arrived: "bg-sky-500/20 text-sky-100 border-sky-400/30",
  checked_in: "bg-emerald-500/20 text-emerald-100 border-emerald-400/30",
  yard: "bg-lime-500/20 text-lime-100 border-lime-400/30",
  break: "bg-amber-500/20 text-amber-100 border-amber-400/30",
  training: "bg-violet-500/20 text-violet-100 border-violet-400/30",
  grooming: "bg-pink-500/20 text-pink-100 border-pink-400/30",
  outing: "bg-cyan-500/20 text-cyan-100 border-cyan-400/30",
  transportation: "bg-orange-500/20 text-orange-100 border-orange-400/30",
  ready_for_pickup: "bg-yellow-500/20 text-yellow-100 border-yellow-400/30",
  checked_out: "bg-slate-500/20 text-slate-300 border-slate-400/30",
  overnight: "bg-indigo-500/20 text-indigo-100 border-indigo-400/30",
  other: "bg-white/10 text-white border-white/20"
};

export function OpsStatusBadge({
  status,
  label
}: {
  status?: OpsDogStatusValue | string | null;
  label?: string | null;
}) {
  const key = String(status || "other");
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_TONES[key] || STATUS_TONES.other}`}>
      {label || key.replace(/_/g, " ")}
    </span>
  );
}

export function OpsPriorityBadge({ priority }: { priority?: string | null }) {
  const tones: Record<string, string> = {
    critical: "bg-red-500/20 text-red-100 border-red-400/40",
    high: "bg-orange-500/20 text-orange-100 border-orange-400/40",
    attention: "bg-amber-500/20 text-amber-100 border-amber-400/40",
    informational: "bg-sky-500/20 text-sky-100 border-sky-400/40"
  };
  const key = String(priority || "attention");
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${tones[key] || tones.attention}`}>
      {key}
    </span>
  );
}
