"use client";

import { useMemo } from "react";
import { isLobbyCheckoutDogExpired } from "@/lib/lobby/checkout-display";
import type { LobbyCheckoutDog, LobbyCheckoutsResponse } from "@/lib/lobby/types";

export function useLobbyCheckoutTimers(checkouts: LobbyCheckoutsResponse, nowMs: number) {
  return useMemo(() => {
    const featured =
      checkouts.featured && !isLobbyCheckoutDogExpired(checkouts.featured, nowMs)
        ? checkouts.featured
        : null;
    const queue = (checkouts.queue ?? []).filter((dog) => !isLobbyCheckoutDogExpired(dog, nowMs));
    const activeCount = (featured ? 1 : 0) + queue.length;

    return {
      featured,
      queue,
      activeCount,
      hasCheckout: activeCount > 0
    };
  }, [checkouts, nowMs]);
}
