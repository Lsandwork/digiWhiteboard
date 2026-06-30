"use client";

import clsx from "clsx";
import { MapPin, X } from "lucide-react";
import type { LiveDog } from "@/lib/types";
import { getDogLocationLabel, getDogStatusLabel } from "@/lib/board-utils";
import { DogAvatar } from "@/components/board/DogAvatar";

type DogStatusCardProps = {
  dog: LiveDog;
  mode: "in" | "out";
  isNew?: boolean;
  isAlerting?: boolean;
  isReminding?: boolean;
  isExpiringSoon?: boolean;
  showStaffClear?: boolean;
  onClear?: () => void;
};

export function DogStatusCard({
  dog,
  mode,
  isNew = false,
  isAlerting = false,
  isReminding = false,
  isExpiringSoon = false,
  showStaffClear = false,
  onClear
}: DogStatusCardProps) {
  const statusLabel = getDogStatusLabel(dog, mode);
  const locationLabel = getDogLocationLabel(dog);
  const personLabel = mode === "in" ? "Owner" : "Pickup";
  const personName = dog.owner_name;

  return (
    <article
      className={clsx(
        "board-card relative rounded-2xl p-4 sm:p-5",
        mode === "in" ? "board-card-in" : "board-card-out",
        mode === "in" && isNew && "checkin-entrance",
        mode === "out" && isNew && "checkout-entrance",
        mode === "out" && isAlerting && "checkout-alert-active",
        mode === "out" && !isAlerting && isReminding && "checkout-reminder-pulse",
        mode === "out" && isExpiringSoon && !isAlerting && "checkout-expiring-soon"
      )}
    >
      {showStaffClear && mode === "out" && onClear ? (
        <button
          type="button"
          onClick={onClear}
          className="absolute right-3 top-3 rounded-full border border-slate-600/60 bg-slate-950/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-300 transition hover:border-amber-400/50 hover:text-amber-200"
          aria-label={`Clear ${dog.animal_name} from Checking Out`}
        >
          <span className="inline-flex items-center gap-1">
            <X className="h-3 w-3" />
            Clear
          </span>
        </button>
      ) : null}

      <div className="flex items-center gap-4 sm:gap-5">
        <DogAvatar dog={dog} mode={mode} isAlerting={isAlerting} isNew={isNew} />

        <div className="min-w-0 flex-1">
          <h3
            className={clsx(
              "truncate text-3xl font-black leading-tight sm:text-4xl",
              mode === "out" && isAlerting ? "checkout-name-alert text-white" : "text-white"
            )}
          >
            {dog.animal_name}
          </h3>
          {personName ? (
            <p className="mt-1 truncate text-lg text-slate-400 sm:text-xl">
              {personLabel}: <span className="text-slate-200">{personName}</span>
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {mode === "out" && isAlerting ? (
            <span className="checkout-ready-badge inline-flex items-center gap-2 rounded-full border border-amber-300/60 bg-amber-400/15 px-3 py-1.5 text-xs font-black uppercase tracking-wide text-amber-100 sm:px-4 sm:py-2 sm:text-sm">
              Ready
            </span>
          ) : null}

          <span
            className={clsx(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wide sm:px-4 sm:py-2 sm:text-sm",
              mode === "in"
                ? "border-fitdog-blue/50 bg-fitdog-blue/12 text-fitdog-blue"
                : "border-fitdog-orange/50 bg-fitdog-orange/12 text-fitdog-orange",
              mode === "out" && isAlerting && "checkout-status-badge-alert"
            )}
          >
            <span
              className={clsx("h-2 w-2 rounded-full", mode === "in" ? "bg-fitdog-blue" : "bg-fitdog-orange")}
            />
            {statusLabel}
          </span>

          {locationLabel ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-slate-400 sm:text-base">
              <MapPin className="h-4 w-4 shrink-0" />
              <span className="max-w-[140px] truncate sm:max-w-[180px]">{locationLabel}</span>
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}
