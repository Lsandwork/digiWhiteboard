import { NextResponse } from "next/server";
import {
  fetchSantaMonicaWeather,
  WEATHER_CACHE_TTL_MS,
  WEATHER_HTTP_CACHE_SECONDS
} from "@/lib/staff/santa-monica-weather";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

/**
 * Shared Santa Monica weather for RuffOPS screens.
 * Clients hit this endpoint only — never upstream weather APIs directly, never the database.
 * Process TTL cache + HTTP Cache-Control share one upstream fetch per window.
 */
export async function GET() {
  const maxAgeSec = WEATHER_HTTP_CACHE_SECONDS || Math.floor(WEATHER_CACHE_TTL_MS / 1000);
  try {
    const weather = await fetchSantaMonicaWeather();
    return NextResponse.json(
      { ok: true, weather },
      {
        headers: {
          "Cache-Control": `public, max-age=${maxAgeSec}, s-maxage=${maxAgeSec}, stale-while-revalidate=60`
        }
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Weather unavailable.";
    return NextResponse.json(
      { ok: false, error: message, weather: null },
      {
        status: 503,
        headers: {
          "Cache-Control": "public, max-age=60, s-maxage=60"
        }
      }
    );
  }
}
