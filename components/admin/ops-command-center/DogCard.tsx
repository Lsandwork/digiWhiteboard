"use client";

import { OpsStatusBadge } from "@/components/admin/ops-command-center/StatusBadge";

export type OpsDogCardModel = {
  id: string;
  name: string;
  ownerName?: string | null;
  photoUrl?: string | null;
  status?: string | null;
  locationLabel?: string | null;
  alertText?: string | null;
  gingrAnimalId?: string | null;
};

export function OpsDogCard({
  dog,
  onOpen,
  compact,
  theme = "admin"
}: {
  dog: OpsDogCardModel;
  onOpen?: (id: string) => void;
  compact?: boolean;
  theme?: "admin" | "floor";
}) {
  const floor = theme === "floor";
  return (
    <button
      type="button"
      onClick={() => onOpen?.(dog.id)}
      className={
        floor
          ? `ops-floor__dog-card${compact ? " ops-floor__dog-card--compact" : ""}`
          : `flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] text-left transition hover:border-sky-400/40 ${
              compact ? "px-2.5 py-2" : "px-3 py-3"
            }`
      }
    >
      <div
        className={
          floor
            ? "ops-floor__dog-card-photo"
            : "h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-white/10"
        }
      >
        {dog.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={dog.photoUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className={floor ? "ops-floor__sub" : "grid h-full place-items-center text-xs text-admin-muted"}>DOG</div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className={floor ? "ops-floor__dog truncate" : "truncate text-sm font-semibold text-white"}>{dog.name}</p>
          {dog.status ? <OpsStatusBadge status={dog.status} /> : null}
        </div>
        <p className={floor ? "ops-floor__sub truncate" : "truncate text-xs text-admin-muted"}>
          {dog.ownerName || "Owner unknown"}
          {dog.locationLabel ? ` · ${dog.locationLabel}` : ""}
        </p>
        {dog.alertText ? (
          <p className={floor ? "mt-0.5 truncate ops-floor__sub" : "mt-0.5 truncate text-xs text-amber-200"}>
            {dog.alertText}
          </p>
        ) : null}
      </div>
    </button>
  );
}
