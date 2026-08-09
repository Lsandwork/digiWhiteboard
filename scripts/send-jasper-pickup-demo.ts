/**
 * Demo run: Jasper pickup live-track SMS (no Samsara export).
 *
 * Van starts Lincoln & Manchester → 7742 Redlands St, Playa Del Rey, CA 90293.
 * Driver start clock: 9:08pm PT (or now if that time already passed today).
 * Sends SMS to 2139131391 and follow-ups as the van approaches / pulls up in real time.
 *
 * Usage:
 *   npx tsx scripts/send-jasper-pickup-demo.ts [phone]
 *   npx tsx scripts/send-jasper-pickup-demo.ts 2139131391 --no-followup
 */
import { loadEnvFiles } from "./load-env-local";
loadEnvFiles();

import { getSmsProvider } from "../lib/integrations/sms/provider";
import { getPublicSiteUrl } from "../lib/site-url";
import { getDemoDriveState, getOwnerTrackingDemo } from "../lib/route-generator/owner-tracking";

const TO = (process.argv[2] && !process.argv[2].startsWith("-") ? process.argv[2] : null) || "2139131391";
const NO_FOLLOWUP = process.argv.includes("--no-followup");
const TOKEN = "jasper";

function laCivilToUtcMs(year: number, month: number, day: number, hour: number, minute: number): number {
  const pad = (n: number) => String(n).padStart(2, "0");
  // Interpret as America/Los_Angeles by probing offset
  const guess = Date.parse(`${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00-07:00`);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  // Refine with iterative offset from formatToParts
  let ms = guess;
  for (let i = 0; i < 3; i += 1) {
    const parts = fmt.formatToParts(new Date(ms));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const h = get("hour") === 24 ? 0 : get("hour");
    const asShown = Date.UTC(get("year"), get("month") - 1, get("day"), h, get("minute"));
    const want = Date.UTC(year, month - 1, day, hour, minute);
    ms += want - asShown;
  }
  return ms;
}

function driverStartMs(now = Date.now()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(now));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const target = laCivilToUtcMs(get("year"), get("month"), get("day"), 21, 8); // 9:08pm PT
  // If 9:08pm already passed by >2 min, start now so the demo still runs.
  if (now > target + 2 * 60_000) return now;
  // If we're before 9:08pm, pin to 9:08pm (van "starts" then).
  return target;
}

async function send(body: string, key: string) {
  const sms = getSmsProvider();
  const sent = await sms.send({
    to: TO,
    body,
    purpose: "transactional",
    idempotencyKey: key.slice(0, 64)
  });
  return sent;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const sms = getSmsProvider();
  if (!sms.isConfigured()) {
    throw new Error(
      "Twilio is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_MESSAGING_SERVICE_SID (or TWILIO_FROM_NUMBER)."
    );
  }

  const base = getPublicSiteUrl().replace(/\/$/, "") || "https://staff.ruffops.com";
  const startedAtMs = driverStartMs();
  const trackUrl = `${base}/track/${TOKEN}?t=${startedAtMs}`;
  const view = getOwnerTrackingDemo(TOKEN, { startedAtMs, nowMs: Math.max(Date.now(), startedAtMs) });
  const drive = getDemoDriveState(Math.max(Date.now(), startedAtMs), startedAtMs, TOKEN);

  const startBody = `Fitdog: Jasper pickup — driver departing Lincoln & Manchester at 9:08pm. About ${drive.etaMinutes} min to 7742 Redlands St, Playa Del Rey. Track live: ${trackUrl}`;
  const start = await send(startBody, `jasper-demo-start:${TO}:${startedAtMs}`);
  console.log(
    JSON.stringify(
      {
        phase: "start",
        ok: start.ok,
        to: TO,
        body: startBody,
        trackUrl,
        startedAtMs,
        startLocalHint: "9:08pm America/Los_Angeles (or now if past)",
        etaMinutes: drive.etaMinutes,
        stop: view.stopAddress,
        vehicleStart: drive.vehicle,
        error: start.error,
        providerMessageId: start.providerMessageId
      },
      null,
      2
    )
  );
  if (!start.ok) process.exit(1);

  if (NO_FOLLOWUP) return;

  // Real-time follow-ups as the simulated van approaches / pulls up.
  let sentApproaching = false;
  let sentPullingUp = false;
  let sentArrived = false;
  const deadline = Date.now() + 6 * 60_000;

  while (Date.now() < deadline) {
    await sleep(12_000);
    const now = Date.now();
    // If we pinned a future 9:08pm start, wait until then before advancing SMS phases.
    const clock = Math.max(now, startedAtMs);
    const state = getDemoDriveState(clock, startedAtMs, TOKEN);
    const liveView = getOwnerTrackingDemo(TOKEN, { startedAtMs, nowMs: clock });

    if (!sentApproaching && !state.arrived && state.etaMinutes <= 5 && state.etaMinutes > 2) {
      sentApproaching = true;
      const body = `Fitdog: Jasper's driver is about ${state.etaMinutes} min away from 7742 Redlands St. Live map: ${trackUrl}`;
      const res = await send(body, `jasper-demo-approach:${TO}:${startedAtMs}`);
      console.log(JSON.stringify({ phase: "approaching", ok: res.ok, body, eta: state.etaMinutes, error: res.error }));
    }

    if (
      !sentPullingUp &&
      !state.arrived &&
      (state.etaMinutes <= 2 || state.routeProgress >= 0.92 || liveView.status === "pulling_up")
    ) {
      sentPullingUp = true;
      const body = `Fitdog: driver is pulling up to Jasper's stop at 7742 Redlands St, Playa Del Rey right now. ${trackUrl}`;
      const res = await send(body, `jasper-demo-pullup:${TO}:${startedAtMs}`);
      console.log(
        JSON.stringify({
          phase: "pulling_up",
          ok: res.ok,
          body,
          eta: state.etaMinutes,
          progress: Number(state.routeProgress.toFixed(3)),
          headline: liveView.headline,
          error: res.error
        })
      );
    }

    if (!sentArrived && state.arrived) {
      sentArrived = true;
      const body = `Fitdog: your driver has arrived for Jasper at 7742 Redlands St, Playa Del Rey. ${trackUrl}`;
      const res = await send(body, `jasper-demo-arrived:${TO}:${startedAtMs}`);
      console.log(JSON.stringify({ phase: "arrived", ok: res.ok, body, error: res.error }));
      break;
    }
  }

  if (!sentPullingUp) {
    console.warn("Demo ended before pulling-up SMS — check speed factor / start time.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
