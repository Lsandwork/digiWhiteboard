import { config } from "dotenv";
config({ path: ".env.local" });
import { writeFileSync } from "node:fs";
import { canUseFitdogEmployeeApi, pullFitdogRouteReportFromApi } from "../lib/route-generator/fitdog-api";

(async () => {
  const date = process.argv[2] || "2026-09-30";
  console.log("fitdog creds:", canUseFitdogEmployeeApi());
  const bundle = await pullFitdogRouteReportFromApi(date);
  writeFileSync(`tmp/fitdog-${date}.json`, JSON.stringify(bundle, null, 2));
  console.log("occurrences:", bundle.occurrenceCount, "products:", bundle.productCount, "services:", bundle.services);
  const names = new Map<string, string>();
  for (const item of bundle.pickupItems) names.set(String(item.dogName), String(item.serviceRaw || item.service));
  console.log("dogs:", [...names.entries()].map(([n, s]) => `${n} (${s})`).join(" | "));
  console.log("skipped:", bundle.skippedOccurrences.map((o) => `${o.className}: ${o.dogs.map((d) => d.dogName).join(",")}`));
  console.log("warnings:", bundle.warnings);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
