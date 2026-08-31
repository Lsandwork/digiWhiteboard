import { createGingrClient } from "@/lib/integrations/gingr/client";
import { buildGingrRouteSchedulePayload } from "@/lib/gingr-route-generator/normalize";
import {
  invalidateGingrRouteCache,
  readGingrRouteCache,
  withGingrRouteInflight,
  writeGingrRouteCache
} from "@/lib/gingr-route-generator/cache";

function isValidDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function todayPacificDateKey(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}

export async function loadGingrRouteSchedule(options: {
  date: string;
  refresh?: boolean;
}) {
  const date = isValidDate(options.date) ? options.date : todayPacificDateKey();

  if (!options.refresh) {
    const cached = readGingrRouteCache(date);
    if (cached) return { ...cached, cacheHit: true as const };
  } else {
    invalidateGingrRouteCache(date);
  }

  const payload = await withGingrRouteInflight(date, async () => {
    const client = createGingrClient();
    if (!client.config.apiKey) {
      throw new Error("GINGR_API_KEY is not configured.");
    }
    const reservations = await client.listReservationsByDate(date);
    const next = buildGingrRouteSchedulePayload(date, reservations, {
      cached: false,
      fetchedAt: new Date().toISOString()
    });
    writeGingrRouteCache(date, next);
    return next;
  });

  return { ...payload, cacheHit: false as const };
}
