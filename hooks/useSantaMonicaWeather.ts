"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchBoardJson } from "@/lib/board-fetch";
import type { SantaMonicaWeather } from "@/lib/staff/santa-monica-weather";

/** Align with server weather cache (15m) so UI refresh does not fan out upstream fetches. */
const WEATHER_POLL_MS = 12 * 60_000;
const WEATHER_TIMEOUT_MS = 8_000;

type WeatherResponse = {
  ok?: boolean;
  weather?: SantaMonicaWeather | null;
};

export function useSantaMonicaWeather(options?: { enabled?: boolean; pollMs?: number }) {
  const enabled = options?.enabled !== false;
  const pollMs = options?.pollMs ?? WEATHER_POLL_MS;
  const [weather, setWeather] = useState<SantaMonicaWeather | null>(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    const result = await fetchBoardJson<WeatherResponse>({
      url: "/api/staff/weather",
      timeoutMs: WEATHER_TIMEOUT_MS,
      cacheKey: "staff-santa-monica-weather",
      keepLastGood: true
    });
    if (result.data?.weather) {
      setWeather(result.data.weather);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const initial = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), pollMs);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [enabled, load, pollMs]);

  return weather;
}
