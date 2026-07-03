"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getCheckoutMergeKey } from "@/lib/board-sticky-checkout";
import {
  CHECKOUT_ALERT_MS,
  CHECKOUT_REMINDER_DURATION_MS,
  CHECKOUT_REMINDER_INTERVAL_MS,
  getCheckoutDisplayUntilAt,
  getCheckoutDisplayMs,
  shouldExpireCheckoutDog
} from "@/lib/checkout-display";
import type { LiveDog } from "@/lib/types";

export type CheckoutDisplayEntry = {
  dog: LiveDog;
  stableKey: string;
  isNew: boolean;
  isAlerting: boolean;
  isReminding: boolean;
  isExpiringSoon: boolean;
  alertUntil: number;
  displayUntil: number;
};

function getStartedAtMs(dog: LiveDog) {
  const anchor = dog.status_started_at ?? dog.updated_at;
  return anchor ? new Date(anchor).getTime() : Date.now();
}

export function useCheckoutDisplayTimers(
  checkingOutDogs: LiveDog[],
  now: number,
  firstSeenByKey: Map<string, number> = new Map()
) {
  const [remindingKeys, setRemindingKeys] = useState<Set<string>>(new Set());
  const [manuallyExpired, setManuallyExpired] = useState<Set<string>>(new Set());

  const visibleCheckoutDogs = useMemo(() => {
    const entries: CheckoutDisplayEntry[] = [];

    for (const dog of checkingOutDogs) {
      const stableKey = getCheckoutMergeKey(dog);
      if (manuallyExpired.has(stableKey)) continue;

      const firstSeenAt = firstSeenByKey.get(stableKey) ?? getStartedAtMs(dog);
      if (shouldExpireCheckoutDog(dog, new Date(now), firstSeenAt)) continue;

      const alertUntil = firstSeenAt + CHECKOUT_ALERT_MS;
      const displayUntil =
        getCheckoutDisplayUntilAt(dog, firstSeenAt, new Date(now))?.getTime() ??
        firstSeenAt + getCheckoutDisplayMs();
      const msUntilExpiry = displayUntil - now;

      entries.push({
        dog,
        stableKey,
        isNew: now - firstSeenAt < CHECKOUT_ALERT_MS + 500,
        isAlerting: now < alertUntil,
        isReminding: remindingKeys.has(stableKey),
        isExpiringSoon: msUntilExpiry <= 60_000,
        alertUntil,
        displayUntil
      });
    }

    return entries;
  }, [checkingOutDogs, firstSeenByKey, manuallyExpired, now, remindingKeys]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setRemindingKeys((current) => {
        const next = new Set(current);

        for (const entry of visibleCheckoutDogs) {
          if (now < entry.alertUntil) continue;

          const elapsedSinceAlert = now - entry.alertUntil;
          const cyclePosition = elapsedSinceAlert % CHECKOUT_REMINDER_INTERVAL_MS;

          if (cyclePosition < CHECKOUT_REMINDER_DURATION_MS) {
            next.add(entry.stableKey);
          } else if (next.has(entry.stableKey)) {
            next.delete(entry.stableKey);
          }
        }

        return next;
      });
    }, 250);

    return () => window.clearInterval(interval);
  }, [now, visibleCheckoutDogs]);

  const manuallyExpireCheckout = useCallback((dog: LiveDog) => {
    setManuallyExpired((current) => new Set(current).add(getCheckoutMergeKey(dog)));
  }, []);

  return {
    visibleCheckoutDogs,
    manuallyExpireCheckout
  };
}
