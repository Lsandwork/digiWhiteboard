"use client";

import { useMemo } from "react";
import { getStableCheckinKey, shouldExpireCheckinDog } from "@/lib/checkin-display";
import type { LiveDog } from "@/lib/types";

export function useCheckinDisplayTimers(checkingInDogs: LiveDog[], now: number) {
  const visibleCheckingInDogs = useMemo(
    () =>
      checkingInDogs.filter((dog) => {
        if (!getStableCheckinKey(dog)) return false;
        return !shouldExpireCheckinDog(dog, new Date(now));
      }),
    [checkingInDogs, now]
  );

  return { visibleCheckingInDogs };
}
