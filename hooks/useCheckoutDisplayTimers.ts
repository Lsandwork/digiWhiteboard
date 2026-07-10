"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getCheckoutMergeKey } from "@/lib/board-sticky-checkout";
import {
  CHECKOUT_ALERT_MS,
  CHECKOUT_REMINDER_DURATION_MS,
  CHECKOUT_REMINDER_INTERVAL_MS,
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

export type CheckoutDisplayMeta = {
  firstSeenAt: number;
  introducedAt: number;
  displayUntilMs: number;
};

function getStartedAtMs(dog: LiveDog) {
  const anchor = dog.status_started_at ?? dog.updated_at;
  return anchor ? new Date(anchor).getTime() : Date.now();
}

export function useCheckoutDisplayTimers(
  checkingOutDogs: LiveDog[],
  now: number,
  firstSeenByKey: Map<string, number> = new Map(),
  displayMetaByKey: Map<string, CheckoutDisplayMeta> = new Map()
) {
  const [remindingKeys, setRemindingKeys] = useState<Set<string>>(new Set());
  const [manuallyExpired, setManuallyExpired] = useState<Set<string>>(new Set());
  const [introducedKeys, setIntroducedKeys] = useState<Set<string>>(new Set());

  const visibleCheckoutDogs = useMemo(() => {
    const entries: CheckoutDisplayEntry[] = [];

    for (const dog of checkingOutDogs) {
      const stableKey = getCheckoutMergeKey(dog);
      if (manuallyExpired.has(stableKey)) continue;

      const meta = displayMetaByKey.get(stableKey);
      const firstSeenAt = meta?.firstSeenAt ?? firstSeenByKey.get(stableKey) ?? getStartedAtMs(dog);
      const introducedAt = meta?.introducedAt ?? firstSeenAt;
      if (shouldExpireCheckoutDog(dog, new Date(now), firstSeenAt)) continue;

      const displayUntil = meta?.displayUntilMs ?? firstSeenAt + getCheckoutDisplayMs();
      if (now >= displayUntil) continue;

      const alertUntil = firstSeenAt + CHECKOUT_ALERT_MS;
      const msUntilExpiry = displayUntil - now;
      const isIntroPeriod = now - introducedAt < CHECKOUT_ALERT_MS + 500;

      entries.push({
        dog,
        stableKey,
        isNew: isIntroPeriod && !introducedKeys.has(stableKey),
        isAlerting: now < alertUntil,
        isReminding: remindingKeys.has(stableKey),
        isExpiringSoon: msUntilExpiry <= 60_000,
        alertUntil,
        displayUntil
      });
    }

    return entries;
  }, [checkingOutDogs, displayMetaByKey, firstSeenByKey, introducedKeys, manuallyExpired, now, remindingKeys]);

  useEffect(() => {
    const newlyIntroduced = visibleCheckoutDogs
      .filter((entry) => !entry.isNew && !introducedKeys.has(entry.stableKey))
      .map((entry) => entry.stableKey);
    if (!newlyIntroduced.length) return;
    const timer = window.setTimeout(() => {
      setIntroducedKeys((current) => {
        const next = new Set(current);
        newlyIntroduced.forEach((key) => next.add(key));
        return next;
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [introducedKeys, visibleCheckoutDogs]);

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
