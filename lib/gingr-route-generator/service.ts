import { createGingrClient } from "@/lib/integrations/gingr/client";
import {
  buildGingrRouteSchedulePayload,
  summarizeRouteDogs,
  type GingrRouteDog,
  type GingrRouteSchedulePayload
} from "@/lib/gingr-route-generator/normalize";
import {
  fitdogSignupsToRouteDogs,
  mergeFitdogRouteDogs
} from "@/lib/gingr-route-generator/fitdog-signups";
import {
  canUseFitdogEmployeeApi,
  pullFitdogClassSignupsForDate
} from "@/lib/route-generator/fitdog-api";
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

/** Outings, group classes, and taxi booked on the Fitdog platform for the date. */
async function loadFitdogSignupDogs(date: string): Promise<{ dogs: GingrRouteDog[]; warnings: string[] }> {
  if (!canUseFitdogEmployeeApi()) {
    return {
      dogs: [],
      warnings: [
        "Fitdog class sign-ups are not connected (FITDOG_EMPLOYEE_EMAIL / FITDOG_EMPLOYEE_PASSWORD), so outings and classes booked in the Fitdog app are missing."
      ]
    };
  }
  try {
    const { signups } = await pullFitdogClassSignupsForDate(date);
    return { dogs: fitdogSignupsToRouteDogs(signups, date), warnings: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[GingrRouteGenerator] Fitdog class sign-ups unavailable:", message);
    return { dogs: [], warnings: [`Fitdog class sign-ups could not be loaded: ${message}`] };
  }
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
    const [reservations, fitdog] = await Promise.all([
      client.listReservationsByDate(date),
      loadFitdogSignupDogs(date)
    ]);
    const gingr = buildGingrRouteSchedulePayload(date, reservations, {
      cached: false,
      fetchedAt: new Date().toISOString()
    });
    const dogs = mergeFitdogRouteDogs(gingr.dogs, fitdog.dogs);
    const next = {
      ...gingr,
      dogs,
      stats: summarizeRouteDogs(dogs),
      source: "gingr_api" as const,
      ...(fitdog.warnings.length ? { warnings: fitdog.warnings } : {})
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
