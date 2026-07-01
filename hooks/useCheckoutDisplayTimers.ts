"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CHECKOUT_ALERT_MS,
  CHECKOUT_REMINDER_DURATION_MS,
  CHECKOUT_REMINDER_INTERVAL_MS,
  EXPIRED_CHECKOUT_STORAGE_KEY,
  getCheckoutDisplayMs,
  getCheckoutDisplayUntilAt,
  getStableCheckoutKey,
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

type TimerState = {
  firstSeenAt: number;
  alertUntil: number;
  displayUntil: number;
  eventAnchor: string;
};

type ExpiredRecord = {
  anchor: string;
  expiredAt: number;
};

type DisplayState = {
  timerMap: Record<string, TimerState>;
  expiredRecords: Record<string, ExpiredRecord>;
  visibleCheckoutDogs: CheckoutDisplayEntry[];
};

function loadExpiredRecords(): Record<string, ExpiredRecord> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(EXPIRED_CHECKOUT_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, ExpiredRecord>;
  } catch {
    return {};
  }
}

function saveExpiredRecords(records: Record<string, ExpiredRecord>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(EXPIRED_CHECKOUT_STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Ignore storage quota errors on kiosk displays.
  }
}

function getEventAnchor(dog: LiveDog) {
  return dog.status_started_at ?? dog.updated_at ?? dog.id;
}

function isExpiredForDog(records: Record<string, ExpiredRecord>, key: string, anchor: string) {
  const record = records[key];
  if (!record) return false;
  return record.anchor === anchor;
}

function buildCheckoutDisplay(
  checkingOutDogs: LiveDog[],
  now: number,
  timerMap: Record<string, TimerState>,
  expiredRecords: Record<string, ExpiredRecord>,
  remindingKeys: Set<string>
): DisplayState {
  const nextTimerMap = { ...timerMap };
  const nextExpired = { ...expiredRecords };
  const entries: CheckoutDisplayEntry[] = [];

  for (const dog of checkingOutDogs) {
    const stableKey = getStableCheckoutKey(dog);
    const eventAnchor = getEventAnchor(dog);

    if (isExpiredForDog(nextExpired, stableKey, eventAnchor)) {
      if (!shouldExpireCheckoutDog(dog, new Date(now))) {
        delete nextExpired[stableKey];
      } else {
        continue;
      }
    }

    const backendExpired = shouldExpireCheckoutDog(dog, new Date(now));
    let timer = nextTimerMap[stableKey];
    const displayUntil =
      getCheckoutDisplayUntilAt(dog, timer?.firstSeenAt ?? now, new Date(now))?.getTime() ??
      (timer?.firstSeenAt ?? now) + getCheckoutDisplayMs();

    if (!timer || timer.eventAnchor !== eventAnchor) {
      const firstSeenAt = now;
      timer = {
        firstSeenAt,
        alertUntil: firstSeenAt + CHECKOUT_ALERT_MS,
        displayUntil,
        eventAnchor
      };
      nextTimerMap[stableKey] = timer;
    } else {
      timer = { ...timer, displayUntil };
      nextTimerMap[stableKey] = timer;
    }

    if (now >= timer.displayUntil || backendExpired) {
      nextExpired[stableKey] = { anchor: eventAnchor, expiredAt: now };
      delete nextTimerMap[stableKey];
      continue;
    }

    const msUntilExpiry = timer.displayUntil - now;

    entries.push({
      dog,
      stableKey,
      isNew: now - timer.firstSeenAt < CHECKOUT_ALERT_MS + 500,
      isAlerting: now < timer.alertUntil,
      isReminding: remindingKeys.has(stableKey),
      isExpiringSoon: msUntilExpiry <= 60_000,
      alertUntil: timer.alertUntil,
      displayUntil: timer.displayUntil
    });
  }

  for (const key of Object.keys(nextTimerMap)) {
    if (!checkingOutDogs.some((dog) => getStableCheckoutKey(dog) === key)) {
      delete nextTimerMap[key];
    }
  }

  return {
    timerMap: nextTimerMap,
    expiredRecords: nextExpired,
    visibleCheckoutDogs: entries
  };
}

export function useCheckoutDisplayTimers(checkingOutDogs: LiveDog[], now: number) {
  const [remindingKeys, setRemindingKeys] = useState<Set<string>>(new Set());
  const [displayState, setDisplayState] = useState<DisplayState>(() => ({
    timerMap: {},
    expiredRecords: loadExpiredRecords(),
    visibleCheckoutDogs: []
  }));

  useEffect(() => {
    // Timer sync must run after each live poll / clock tick.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- kiosk display timer state
    setDisplayState((current) => {
      const next = buildCheckoutDisplay(checkingOutDogs, now, current.timerMap, current.expiredRecords, remindingKeys);
      if (JSON.stringify(current.expiredRecords) !== JSON.stringify(next.expiredRecords)) {
        saveExpiredRecords(next.expiredRecords);
      }
      return next;
    });
  }, [checkingOutDogs, now, remindingKeys]);

  const manuallyExpireCheckout = useCallback((dog: LiveDog) => {
    const key = getStableCheckoutKey(dog);
    const anchor = getEventAnchor(dog);
    setDisplayState((current) => {
      const nextExpired = { ...current.expiredRecords, [key]: { anchor, expiredAt: Date.now() } };
      saveExpiredRecords(nextExpired);
      const nextTimerMap = { ...current.timerMap };
      delete nextTimerMap[key];
      const next = buildCheckoutDisplay(
        checkingOutDogs,
        now,
        nextTimerMap,
        nextExpired,
        remindingKeys
      );
      return next;
    });
  }, [checkingOutDogs, now, remindingKeys]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setRemindingKeys((current) => {
        const next = new Set(current);
        const nowMs = Date.now();

        for (const [key, timer] of Object.entries(displayState.timerMap)) {
          if (nowMs < timer.alertUntil) continue;

          const elapsedSinceAlert = nowMs - timer.alertUntil;
          const cyclePosition = elapsedSinceAlert % CHECKOUT_REMINDER_INTERVAL_MS;

          if (cyclePosition < CHECKOUT_REMINDER_DURATION_MS) {
            next.add(key);
          } else if (next.has(key)) {
            next.delete(key);
          }
        }

        return next;
      });
    }, 250);

    return () => window.clearInterval(interval);
  }, [displayState.timerMap]);

  return {
    visibleCheckoutDogs: displayState.visibleCheckoutDogs,
    manuallyExpireCheckout
  };
}
