"use client";

import type { LiveDog } from "@/lib/types";

export function useCheckinDisplayTimers(checkingInDogs: LiveDog[], _now: number) {
  return { visibleCheckingInDogs: checkingInDogs };
}
