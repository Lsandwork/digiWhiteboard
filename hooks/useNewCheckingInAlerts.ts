"use client";

import { useEffect, useMemo, useState } from "react";
import type { LiveDog } from "@/lib/types";

function getCheckingInKey(dog: LiveDog) {
  const anchor = dog.status_started_at ?? dog.updated_at ?? dog.id;
  return `${dog.gingr_reservation_id ?? dog.id}::${dog.gingr_animal_id ?? dog.id}::${anchor}`;
}

export type CheckingInDisplayEntry = {
  dog: LiveDog;
  isNew: boolean;
};

type CheckingInTrackState = {
  seenKeys: Set<string>;
  newKeys: Set<string>;
};

export function useNewCheckingInAlerts(checkingInDogs: LiveDog[]) {
  const [trackState, setTrackState] = useState<CheckingInTrackState>({
    seenKeys: new Set(),
    newKeys: new Set()
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- entrance animation tracking
    setTrackState((current) => {
      const seenKeys = new Set(current.seenKeys);
      const newKeys = new Set(current.newKeys);
      let changed = false;

      for (const dog of checkingInDogs) {
        const key = getCheckingInKey(dog);
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          newKeys.add(key);
          changed = true;
        }
      }

      return changed ? { seenKeys, newKeys } : current;
    });
  }, [checkingInDogs]);

  useEffect(() => {
    if (!trackState.newKeys.size) return;
    const timer = window.setTimeout(() => {
      setTrackState((current) => ({ ...current, newKeys: new Set() }));
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [trackState.newKeys]);

  const visibleCheckingInDogs = useMemo<CheckingInDisplayEntry[]>(() => {
    return checkingInDogs.map((dog) => ({
      dog,
      isNew: trackState.newKeys.has(getCheckingInKey(dog))
    }));
  }, [checkingInDogs, trackState.newKeys]);

  return { visibleCheckingInDogs };
}
