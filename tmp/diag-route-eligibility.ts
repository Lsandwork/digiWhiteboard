import { config } from "dotenv";
config({ path: ".env.local" });
import { writeFileSync } from "node:fs";
import { createGingrClient } from "../lib/integrations/gingr/client";
import { normalizeGingrRouteReservations } from "../lib/gingr-route-generator/normalize";

(async () => {
  const date = process.argv[2] || "2026-09-30";
  const reservations = await createGingrClient().listReservationsByDate(date);
  writeFileSync(`tmp/gingr-${date}.json`, JSON.stringify(reservations, null, 2));
  console.log("reservations:", reservations.length);
  const result = normalizeGingrRouteReservations(reservations, date);
  console.log("route dogs:", result.dogs.map((d) => `${d.name} [${d.activities.join(",")}]`));
  const sample = reservations.slice(0, 3).map((r) => {
    const rec = r as Record<string, unknown>;
    return Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, typeof v === "object" ? JSON.stringify(v)?.slice(0, 200) : v]));
  });
  console.log(JSON.stringify(sample, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
