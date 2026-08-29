import { NextResponse } from "next/server";
import { fetchSantaMonicaWeather } from "@/lib/staff/santa-monica-weather";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 15;

const NO_STORE = {
  "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
  pragma: "no-cache"
};

/** Public staff-board weather chip — Santa Monica, CA (°F). */
export async function GET() {
  try {
    const weather = await fetchSantaMonicaWeather();
    return NextResponse.json({ ok: true, weather }, { headers: NO_STORE });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Weather unavailable.";
    return NextResponse.json({ ok: false, error: message, weather: null }, { status: 503, headers: NO_STORE });
  }
}
