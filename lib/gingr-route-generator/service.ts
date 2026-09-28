import { createGingrClient } from "@/lib/integrations/gingr/client";
import {
  buildGingrRouteSchedulePayload,
  type GingrRouteSchedulePayload
} from "@/lib/gingr-route-generator/normalize";
import {
  invalidateGingrRouteCache,
  readGingrRouteCache,
  readGingrUploadOverlay,
  withGingrRouteInflight,
  writeGingrRouteCache,
  writeGingrUploadOverlay
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
    const uploaded = readGingrUploadOverlay(date);
    if (uploaded) return { ...uploaded, cacheHit: true as const };
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
    const next = {
      ...buildGingrRouteSchedulePayload(date, reservations, {
        cached: false,
        fetchedAt: new Date().toISOString()
      }),
      source: "gingr_api" as const
    };
    writeGingrRouteCache(date, next);
    return next;
  });

  return { ...payload, cacheHit: false as const };
}

export function saveUploadedGingrRouteSchedule(payload: GingrRouteSchedulePayload) {
  writeGingrUploadOverlay(payload.date, payload);
  return payload;
}
