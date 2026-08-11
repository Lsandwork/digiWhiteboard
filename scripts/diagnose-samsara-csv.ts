/**
 * Diagnose a Samsara route CSV the way Digi's exporter validates it.
 *
 * Usage: npx tsx scripts/diagnose-samsara-csv.ts <file.csv>
 *
 * Business ops hit "Internal Server Error" on cloud.samsara.com uploads. Run this
 * against the exact file they uploaded to see which rows Samsara would reject.
 */
import { readFileSync } from "node:fs";

import {
  buildCsv,
  enforceMonotonicRouteSchedule,
  getCanonicalSamsaraTemplate,
  operatingDateFromSamsaraCsvDateTime,
  parseCsvLine,
  sanitizeSamsaraNotes,
  sanitizeSamsaraText,
  validateExport,
  type ExportStopRow
} from "@/lib/route-generator/samsara-csv";

function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Pass a CSV path.");
  const raw = readFileSync(file, "utf8");

  console.log("line endings:", raw.includes("\r\n") ? "CRLF" : "LF only");
  console.log("BOM:", raw.charCodeAt(0) === 0xfeff ? "present" : "none");
  const nonAscii = [...raw].filter((ch) => ch.charCodeAt(0) > 126);
  const uniqueNonAscii = [...new Set(nonAscii)].map(
    (ch) => `${JSON.stringify(ch)} (U+${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")})`
  );
  console.log("non-ascii chars:", uniqueNonAscii.length ? uniqueNonAscii.join(", ") : "none");

  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const template = getCanonicalSamsaraTemplate();
  const rows: ExportStopRow[] = [];
  const orderByRoute = new Map<string, number>();
  for (const line of lines.slice(1)) {
    const c = parseCsvLine(line, ",");
    const routeName = c[0] ?? "";
    const order = (orderByRoute.get(routeName) ?? 0) + 1;
    orderByRoute.set(routeName, order);
    rows.push({
      routeName,
      routeNotes: "",
      vehicleName: c[2] ?? "",
      driverName: c[1] ?? "",
      stopName: c[3] ?? "",
      stopNotes: c[6] ?? "",
      stopAddress: c[10] ?? "",
      scheduledArrival: c[4] ?? "",
      scheduledDeparture: c[5] ?? "",
      routeDate: operatingDateFromSamsaraCsvDateTime(c[4] ?? "") ?? "",
      stopOrder: order,
      latitude: c[8] ?? "",
      longitude: c[9] ?? ""
    });
  }

  const operatingDate = rows.map((r) => r.routeDate).find(Boolean) ?? undefined;
  const result = validateExport({ template, rows, csv: raw, operatingDate });
  console.log("\noperatingDate:", operatingDate);
  console.log("rows:", rows.length, "routes:", new Set(rows.map((r) => r.routeName)).size);
  console.log("validation:", result.ok ? "PASSED" : "FAILED");
  const errors = (result.report.errors as string[]) ?? [];
  console.log(`\nerrors (${errors.length}):`);
  for (const e of errors) console.log(" -", e);
  const warnings = (result.report.warnings as string[]) ?? [];
  console.log(`\nwarnings (${warnings.length}):`);
  for (const w of warnings) console.log(" -", w);

  // Apply the same repairs the exporter now performs, and re-validate.
  console.log("\n=== after Digi export repairs ===");
  const repaired: ExportStopRow[] = rows.map((r) => ({
    ...r,
    stopName: sanitizeSamsaraText(r.stopName),
    stopAddress: sanitizeSamsaraText(r.stopAddress),
    stopNotes: sanitizeSamsaraNotes(r.stopNotes)
  }));
  const schedule = enforceMonotonicRouteSchedule(repaired);
  console.log("schedule stops adjusted:", schedule.adjustedStops);
  for (const a of schedule.adjustments) console.log(" *", a);
  const rebuilt = buildCsv({ template, rows: repaired });
  const after = validateExport({ template, rows: repaired, csv: rebuilt.csv, operatingDate });
  console.log("validation:", after.ok ? "PASSED" : "FAILED");
  for (const e of ((after.report.errors as string[]) ?? [])) console.log(" -", e);
  for (const w of ((after.report.warnings as string[]) ?? [])) console.log(" ~", w);
}

main();
