import { readFileSync } from "node:fs";

const date = process.argv[2] || "2026-09-30";
const rows = JSON.parse(readFileSync(`tmp/gingr-${date}.json`, "utf8")) as Array<Record<string, any>>;
for (const r of rows) {
  if (r.cancelled_date) continue;
  const services = (r.services || []).map(
    (s: any) => `${s.name} @${String(s.scheduled_at || "").slice(0, 16)} by=${s.assigned_to ?? ""} $${s.cost}`
  );
  const other = Object.keys(r).filter(
    (k) => Array.isArray(r[k]) && r[k].length && !["services", "deposit", "transaction"].includes(k)
  );
  console.log(
    `${r.animal?.name} | ${r.reservation_type?.type} | ${String(r.start_date).slice(0, 10)}→${String(r.end_date).slice(0, 10)}`
  );
  for (const s of services) console.log("    ", s);
  for (const k of other) console.log("    extra", k, JSON.stringify(r[k]).slice(0, 300));
}
