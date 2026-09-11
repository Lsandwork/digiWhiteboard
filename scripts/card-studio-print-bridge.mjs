#!/usr/bin/env node
/**
 * RuffOps Card Studio Print Bridge (local host agent).
 *
 * This process runs on the computer attached to the ID printer.
 * The browser never talks to USB printers directly.
 *
 * Usage:
 *   CARD_STUDIO_PRINT_BRIDGE_TOKEN=... CARD_STUDIO_PRINT_API=https://staff.ruffops.com/api/card-studio/bridge node scripts/card-studio-print-bridge.mjs
 */
const api = process.env.CARD_STUDIO_PRINT_API;
const token = process.env.CARD_STUDIO_PRINT_BRIDGE_TOKEN;

if (!api || !token) {
  console.error("Print Bridge requires CARD_STUDIO_PRINT_API and CARD_STUDIO_PRINT_BRIDGE_TOKEN.");
  console.error("This endpoint is authenticated. Do not expose an unauthenticated local printer API.");
  process.exit(1);
}

const res = await fetch(api, {
  method: "POST",
  headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  body: JSON.stringify({ protocol: 1 })
});

if (!res.ok) {
  console.error("Print Bridge authentication failed or API unreachable. Jobs were not duplicated.");
  process.exit(1);
}

const body = await res.json();
console.log(`Print Bridge protocol ${body.protocol}. Queued jobs: ${(body.jobs || []).length}`);
