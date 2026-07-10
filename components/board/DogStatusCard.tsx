"use client";

import clsx from "clsx";
import { MapPin, X } from "lucide-react";
import type { LiveDog } from "@/lib/types";
import { getDogLocationLabel, getDogStatusLabel } from "@/lib/board-utils";
import { DogAvatar } from "@/components/board/DogAvatar";
import { getCheckoutDisplayMs } from "@/lib/checkout-display";

type DogStatusCardProps = {
  dog: LiveDog;
  mode: "in" | "out";
  variant?: "default" | "solo";
  isNew?: boolean;
  isAlerting?: boolean;
  isReminding?: boolean;
  isExpiringSoon?: boolean;
  displayUntil?: number;
  nowMs?: number;
  showStaffClear?: boolean;
  onClear?: () => void;
};

export function DogStatusCard({
  dog,
  mode,
  variant = "default",
  isNew = false,
  isAlerting = false,
  isReminding = false,
  isExpiringSoon = false,
  displayUntil,
  nowMs = 0,
  showStaffClear = false,
  onClear
}: DogStatusCardProps) {
  const statusLabel = getDogStatusLabel(dog, mode);
  const locationLabel = getDogLocationLabel(dog);
  const personLabel = mode === "in" ? "Owner" : "Pickup";
  const personName = dog.owner_name;
  const remainingMs = mode === "out" && displayUntil ? Math.max(0, displayUntil - nowMs) : 0;
  const progressPercent =
    mode === "out" && displayUntil ? Math.max(0, Math.min(100, (remainingMs / getCheckoutDisplayMs()) * 100)) : 0;
  const remainingMinutes = Math.floor(remainingMs / 60_000);
  const remainingSeconds = Math.floor((remainingMs % 60_000) / 1000);
  const remainingLabel = `${remainingMinutes}:${String(remainingSeconds).padStart(2, "0")}`;

  const isSolo = variant === "solo";

  return (
    <article
      className={clsx(
        "board-card relative overflow-hidden rounded-2xl p-4 sm:p-5",
        isSolo && "board-card--solo flex min-h-0 flex-1 flex-col justify-center rounded-3xl p-6 sm:p-8 lg:p-10",
        mode === "in" ? "board-card-in" : "board-card-out",
        mode === "in" && isNew && "checkin-entrance",
        mode === "out" && isNew && "checkout-entrance",
        mode === "out" && "checkout-card checkout-card-active",
        mode === "out" && isAlerting && "checkout-alert-active checkout-card-alerting checkout-animated",
        mode === "out" && !isAlerting && isReminding && "checkout-reminder-pulse",
        mode === "out" && isExpiringSoon && !isAlerting && "checkout-expiring-soon"
      )}
    >
      {mode === "out" && isAlerting ? <span className="checkout-row-gold-sweep" aria-hidden="true" /> : null}

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

      <div className={clsx("board-dog-card__grid", isSolo && "board-dog-card__grid--solo")}>
        <DogAvatar dog={dog} mode={mode} isAlerting={isAlerting} isNew={isNew} size={isSolo ? "solo" : "default"} />

        <div className="board-dog-details min-w-0">
          <h3
            className={clsx(
              "board-dog-name",
              isSolo && "board-dog-name--solo",
              mode === "out" && isAlerting && "checkout-name-alert"
            )}
          >
            {dog.animal_name || "Dog"}
          </h3>
          {personName ? (
            <p className={clsx("board-dog-meta mt-1 text-slate-400", isSolo && "board-dog-meta--solo")}>
              {personLabel}: <span className="text-slate-200">{personName}</span>
            </p>
          ) : null}
        </div>

        <div className={clsx("board-dog-status flex shrink-0 flex-col items-end gap-2", isSolo && "gap-3 sm:gap-4")}>
          {mode === "out" && isAlerting ? (
            <span
              className={clsx(
                "checkout-ready-badge inline-flex items-center gap-2 rounded-full border border-amber-300/60 bg-amber-400/15 px-3 py-1.5 font-black uppercase tracking-wide text-amber-100 sm:px-4 sm:py-2",
                isSolo ? "text-base sm:text-lg lg:text-xl" : "text-xs sm:text-sm"
              )}
            >
              Ready
            </span>
          ) : null}

          <span
            className={clsx(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-bold uppercase tracking-wide sm:px-4 sm:py-2",
              isSolo ? "text-base sm:text-lg lg:text-xl" : "text-xs sm:text-sm",
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
            <span className={clsx("inline-flex items-center gap-1.5 text-slate-400", isSolo ? "text-lg sm:text-xl lg:text-2xl" : "text-sm sm:text-base")}>
              <MapPin className={clsx("shrink-0", isSolo ? "h-6 w-6 lg:h-7 lg:w-7" : "h-4 w-4")} />
              <span className={clsx("truncate", isSolo ? "max-w-[220px] sm:max-w-[280px] lg:max-w-[360px]" : "max-w-[140px] sm:max-w-[180px]")}>
                {locationLabel}
              </span>
            </span>
          ) : null}
        </div>
      </div>

      {mode === "out" && displayUntil ? (
        <div className={clsx("mt-4", isSolo && "mt-6 sm:mt-8 lg:mt-10")}>
          <div
            className={clsx(
              "mb-1 flex items-center justify-between font-bold uppercase tracking-[0.18em] text-amber-200/80",
              isSolo ? "text-sm sm:text-base lg:text-lg" : "text-[10px] sm:text-xs"
            )}
          >
            <span>Pickup Window</span>
            <span>Clears in {remainingLabel}</span>
          </div>
          <div className={clsx("overflow-hidden rounded-full bg-slate-900/90", isSolo ? "h-2.5 sm:h-3 lg:h-4" : "h-1.5")}>
            <div
              className={clsx(
                "h-full rounded-full transition-[width] duration-700",
                isExpiringSoon ? "bg-amber-300" : "bg-gradient-to-r from-amber-500 via-yellow-300 to-amber-200"
              )}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      ) : null}
    </article>
  );
}
