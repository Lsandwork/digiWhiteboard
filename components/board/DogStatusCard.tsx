"use client";

import clsx from "clsx";
import { MapPin } from "lucide-react";
import type { LiveDog } from "@/lib/types";
import { getDogLocationLabel, getDogStatusLabel } from "@/lib/board-utils";
import { DogAvatar } from "@/components/board/DogAvatar";

type DogStatusCardProps = {
  dog: LiveDog;
  mode: "in" | "out";
};

export function DogStatusCard({ dog, mode }: DogStatusCardProps) {
  const statusLabel = getDogStatusLabel(dog, mode);
  const locationLabel = getDogLocationLabel(dog);
  const personLabel = mode === "in" ? "Owner" : "Pickup";
  const personName = dog.owner_name;

  return (
    <article
      className={clsx(
        "board-card animate-fade-up rounded-2xl p-4 sm:p-5",
        mode === "in" ? "board-card-in" : "board-card-out"
      )}
    >
      <div className="flex items-center gap-4 sm:gap-5">
        <DogAvatar dog={dog} mode={mode} />

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-3xl font-black leading-tight text-white sm:text-4xl">{dog.animal_name}</h3>
          {personName ? (
            <p className="mt-1 truncate text-lg text-slate-400 sm:text-xl">
              {personLabel}: <span className="text-slate-200">{personName}</span>
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <span
            className={clsx(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wide sm:px-4 sm:py-2 sm:text-sm",
              mode === "in"
                ? "border-fitdog-blue/50 bg-fitdog-blue/12 text-fitdog-blue"
                : "border-fitdog-orange/50 bg-fitdog-orange/12 text-fitdog-orange"
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
