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

/** Floor workstation badges — avoid Tailwind pastels that Clear remaps to navy. */
const FLOOR_STATUS_TONES: Record<string, string> = {
  expected: "ops-floor__status ops-floor__status--muted",
  arrived: "ops-floor__status ops-floor__status--info",
  checked_in: "ops-floor__status ops-floor__status--ok",
  yard: "ops-floor__status ops-floor__status--ok",
  break: "ops-floor__status ops-floor__status--warn",
  training: "ops-floor__status ops-floor__status--info",
  grooming: "ops-floor__status ops-floor__status--warn",
  outing: "ops-floor__status ops-floor__status--info",
  transportation: "ops-floor__status ops-floor__status--warn",
  ready_for_pickup: "ops-floor__status ops-floor__status--warn",
  checked_out: "ops-floor__status ops-floor__status--muted",
  overnight: "ops-floor__status ops-floor__status--info",
  other: "ops-floor__status ops-floor__status--muted"
};

export function OpsStatusBadge({
  status,
  label,
  theme = "admin"
}: {
  status?: OpsDogStatusValue | string | null;
  label?: string | null;
  theme?: "admin" | "floor";
}) {
  const key = String(status || "other");
  const className =
    theme === "floor"
      ? FLOOR_STATUS_TONES[key] || FLOOR_STATUS_TONES.other
      : `inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_TONES[key] || STATUS_TONES.other}`;
  return <span className={className}>{label || key.replace(/_/g, " ")}</span>;
}

export function OpsPriorityBadge({
  priority,
  theme = "admin"
}: {
  priority?: string | null;
  theme?: "admin" | "floor";
}) {
  const tones: Record<string, string> = {
    critical: "bg-red-500/20 text-red-100 border-red-400/40",
    high: "bg-orange-500/20 text-orange-100 border-orange-400/40",
    attention: "bg-amber-500/20 text-amber-100 border-amber-400/40",
    informational: "bg-sky-500/20 text-sky-100 border-sky-400/40"
  };
  const floorTones: Record<string, string> = {
    critical: "ops-floor__status ops-floor__status--late",
    high: "ops-floor__status ops-floor__status--warn",
    attention: "ops-floor__status ops-floor__status--warn",
    informational: "ops-floor__status ops-floor__status--info"
  };
  const key = String(priority || "attention");
  const className =
    theme === "floor"
      ? floorTones[key] || floorTones.attention
      : `inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${tones[key] || tones.attention}`;
  return <span className={className}>{key}</span>;
}
