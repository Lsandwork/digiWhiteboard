/**
 * Send demo owner live-track SMS (Indy / Venice) to a phone number.
 * Demo map: /track/example — simulated drive at 3× (not Samsara).
 */
import { getSmsProvider } from "../lib/integrations/sms/provider";
import { getPublicSiteUrl } from "../lib/site-url";
import { getDemoDriveState } from "../lib/route-generator/owner-tracking";

const TO = process.argv[2] || "2139131391";

async function main() {
  const sms = getSmsProvider();
  if (!sms.isConfigured()) {
    throw new Error("Twilio is not configured.");
  }

  const base = getPublicSiteUrl().replace(/\/$/, "") || "https://staff.ruffops.com";
  const startedAtMs = Date.now();
  // `t` pins the demo clock so the van starts ~12 min away and moves every poll at 3×.
  const trackUrl = `${base}/track/example?t=${startedAtMs}`;
  const drive = getDemoDriveState(startedAtMs, startedAtMs);
  const eta = drive.arrived ? 1 : drive.etaMinutes;

  const body = `Fitdog: your driver is about ${eta} minutes away for Indy. Track live: ${trackUrl}`;
  const sent = await sms.send({
    to: TO,
    body,
    purpose: "transactional",
    idempotencyKey: `demo-track-indy:${TO}:${Math.floor(startedAtMs / 60_000)}`.slice(0, 64)
  });

  console.log(
    JSON.stringify(
      {
        ok: sent.ok,
        to: TO,
        body,
        trackUrl,
        etaMinutes: eta,
        demoSpeedFactor: drive.speedFactor,
        vehicle: drive.vehicle,
        error: sent.error,
        providerMessageId: sent.providerMessageId
      },
      null,
      2
    )
  );

  if (!sent.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
