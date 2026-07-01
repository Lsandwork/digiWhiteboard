"use client";

import { useCallback, useEffect, useState } from "react";
import {
  EXPIRED_CHECKIN_STORAGE_KEY,
  getCheckinDisplayMs,
  getCheckinDisplayUntilAt,
  getStableCheckinKey,
  shouldExpireCheckinDog
} from "@/lib/checkin-display";
import type { LiveDog } from "@/lib/types";

type TimerState = {
  firstSeenAt: number;
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
  visibleCheckingInDogs: LiveDog[];
};

function loadExpiredRecords(): Record<string, ExpiredRecord> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(EXPIRED_CHECKIN_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, ExpiredRecord>;
  } catch {
    return {};
  }
}

function saveExpiredRecords(records: Record<string, ExpiredRecord>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(EXPIRED_CHECKIN_STORAGE_KEY, JSON.stringify(records));
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

function buildCheckinDisplay(
  checkingInDogs: LiveDog[],
  now: number,
  timerMap: Record<string, TimerState>,
  expiredRecords: Record<string, ExpiredRecord>
): DisplayState {
  const nextTimerMap = { ...timerMap };
  const nextExpired = { ...expiredRecords };
  const visible: LiveDog[] = [];

  for (const dog of checkingInDogs) {
    const stableKey = getStableCheckinKey(dog);
    const eventAnchor = getEventAnchor(dog);

    if (isExpiredForDog(nextExpired, stableKey, eventAnchor)) {
      if (!shouldExpireCheckinDog(dog, new Date(now))) {
        delete nextExpired[stableKey];
      } else {
        continue;
      }
    }

    const backendExpired = shouldExpireCheckinDog(dog, new Date(now));
    let timer = nextTimerMap[stableKey];
    const displayUntil =
      getCheckinDisplayUntilAt(dog, timer?.firstSeenAt ?? now, new Date(now))?.getTime() ??
      (timer?.firstSeenAt ?? now) + getCheckinDisplayMs();

    if (!timer || timer.eventAnchor !== eventAnchor) {
      timer = { firstSeenAt: now, displayUntil, eventAnchor };
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

    visible.push(dog);
  }

  for (const key of Object.keys(nextTimerMap)) {
    if (!checkingInDogs.some((dog) => getStableCheckinKey(dog) === key)) {
      delete nextTimerMap[key];
    }
  }

  return {
    timerMap: nextTimerMap,
    expiredRecords: nextExpired,
    visibleCheckingInDogs: visible
  };
}

export function useCheckinDisplayTimers(checkingInDogs: LiveDog[], now: number) {
  const [displayState, setDisplayState] = useState<DisplayState>(() => ({
    timerMap: {},
    expiredRecords: loadExpiredRecords(),
    visibleCheckingInDogs: []
  }));

  useEffect(() => {
    // Timer sync must run after each live poll / clock tick.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- kiosk display timer state
    setDisplayState((current) => {
      const next = buildCheckinDisplay(checkingInDogs, now, current.timerMap, current.expiredRecords);
      if (JSON.stringify(current.expiredRecords) !== JSON.stringify(next.expiredRecords)) {
        saveExpiredRecords(next.expiredRecords);
      }
      return next;
    });
  }, [checkingInDogs, now]);

  const manuallyExpireCheckin = useCallback((dog: LiveDog) => {
    const key = getStableCheckinKey(dog);
    const anchor = getEventAnchor(dog);
    setDisplayState((current) => {
      const nextExpired = { ...current.expiredRecords, [key]: { anchor, expiredAt: Date.now() } };
      saveExpiredRecords(nextExpired);
      const nextTimerMap = { ...current.timerMap };
      delete nextTimerMap[key];
      const next = buildCheckinDisplay(checkingInDogs, now, nextTimerMap, nextExpired);
      return next;
    });
  }, [checkingInDogs, now]);

  return {
    visibleCheckingInDogs: displayState.visibleCheckingInDogs,
    manuallyExpireCheckin
  };
}
