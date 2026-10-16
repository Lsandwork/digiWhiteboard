import { config } from "dotenv";
config({ path: ".env.local" });
import { writeFileSync } from "node:fs";
import { createGingrClient, normalizeGingrReservationList } from "../lib/integrations/gingr/client";

const expected = [
  "Penelope", "Emmie", "Daisy", "Teddy", "Beau", "Stevie", "Mac", "Nikita", "Annie", "Brontë",
  "Zuma", "Angus", "Baxter", "Mookie", "Bruno", "Ollie", "Bill", "Indy", "Chazzy", "Gracie",
  "Garnet", "Harper", "Darcy", "Remy", "Tilly", "Juno", "Jojo", "Chucky", "Atlas", "Osita", "Luci", "Oscar"
];

async function post(fields: Record<string, string>) {
  const client = createGingrClient();
  const body = new URLSearchParams({ key: client.config.apiKey, ...fields });
  const res = await fetch(`${client.config.baseUrl}/api/v1/reservations`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  return normalizeGingrReservationList(await res.json()) as Array<Record<string, any>>;
}

(async () => {
  const date = process.argv[2] || "2026-09-30";
  const variants: Record<string, Record<string, string>> = {
    d0929: { start_date: "2026-09-29", end_date: "2026-09-29", checked_in: "false", location_id: "1" },
    d1001: { start_date: "2026-10-01", end_date: "2026-10-01", checked_in: "false", location_id: "1" },
    range_0925_1005: { start_date: "2026-09-25", end_date: "2026-10-05", checked_in: "false", location_id: "1" }
  };
  for (const [label, fields] of Object.entries(variants)) {
    const rows = await post(fields);
    writeFileSync(`tmp/probe-${label}-${date}.json`, JSON.stringify(rows, null, 2));
    const names = new Set(rows.filter((r) => !r.cancelled_date).map((r) => String(r.animal?.name || "").trim()));
    const found = expected.filter((n) => [...names].some((x) => x.toLowerCase().startsWith(n.toLowerCase())));
    console.log(`${label}: ${rows.length} rows, expected found ${found.length}/${expected.length}`);
    console.log("   missing:", expected.filter((n) => !found.includes(n)).join(", "));
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
