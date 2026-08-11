/**
 * Regression: the Samsara export must repair out-of-order stop times instead of
 * refusing to build a file.
 *
 * Real incident (fitdog-samsara-routes-2026-08-11-5.csv): the return-to-depot stop
 * was timed 11:18 on a route whose previous stop departed 11:50, and Van 05 had two
 * stops both at 07:00. Samsara answered the upload with "Internal Server Error", and
 * Digi's fail-closed validator refused to hand over a corrected file — so coordinators
 * re-uploaded an older copy from Downloads and hit the same error again.
 */
import assert from "node:assert/strict";

import {
  buildCsv,
  enforceMonotonicRouteSchedule,
  getCanonicalSamsaraTemplate,
  sanitizeSamsaraNotes,
  validateExport,
  type ExportStopRow
} from "@/lib/route-generator/samsara-csv";

function stop(overrides: Partial<ExportStopRow> & { stopName: string; stopOrder: number }): ExportStopRow {
  return {
    routeName: "2026-08-11 PM Drop-Off - Van 01",
    routeNotes: "",
    vehicleName: "Van 01",
    driverName: "",
    stopNotes: "1 dog(s)",
    stopAddress: "1712 21st St, Santa Monica, CA 90404",
    scheduledArrival: "8/11/2026 11:00",
    scheduledDeparture: "8/11/2026 11:05",
    routeDate: "2026-08-11",
    latitude: "34.02485",
    longitude: "-118.4738934",
    ...overrides
  };
}

// 1. Depot return timed before the last customer stop (the exact production shape).
{
  const rows = [
    stop({ stopName: "Kenneth Hahn Trail", stopOrder: 1, scheduledArrival: "8/11/2026 10:30", scheduledDeparture: "8/11/2026 10:35" }),
    stop({ stopName: "Atlas Gold", stopOrder: 2, scheduledArrival: "8/11/2026 11:45", scheduledDeparture: "8/11/2026 11:50" }),
    stop({ stopName: "Fitdog Westwood Hub", stopOrder: 3, scheduledArrival: "8/11/2026 11:18", scheduledDeparture: "8/11/2026 11:23" })
  ];
  const result = enforceMonotonicRouteSchedule(rows);
  assert.equal(result.adjustedStops, 1, "only the depot stop should move");
  assert.equal(rows[2]!.scheduledArrival, "8/11/2026 11:51");
  assert.equal(rows[2]!.scheduledDeparture, "8/11/2026 11:56", "original 5-minute dwell is preserved");
  // Earlier stops untouched.
  assert.equal(rows[1]!.scheduledArrival, "8/11/2026 11:45");

  const template = getCanonicalSamsaraTemplate();
  const csv = buildCsv({ template, rows }).csv;
  const validation = validateExport({ template, rows, csv, operatingDate: "2026-08-11" });
  assert.equal(validation.ok, true, `export should validate: ${JSON.stringify(validation.report.errors)}`);
}

// 2. Two stops scheduled at the identical minute (Van 05 depot + facility stop).
{
  const rows = [
    stop({ routeName: "2026-08-11 AM Pickup - Van 05", stopName: "Fitdog Club", stopOrder: 1, scheduledArrival: "8/11/2026 7:00", scheduledDeparture: "8/11/2026 7:05" }),
    stop({ routeName: "2026-08-11 AM Pickup - Van 05", stopName: "Fitdog Club (2)", stopOrder: 2, scheduledArrival: "8/11/2026 7:00", scheduledDeparture: "8/11/2026 7:05" })
  ];
  enforceMonotonicRouteSchedule(rows);
  assert.equal(rows[1]!.scheduledArrival, "8/11/2026 7:06");
  assert.equal(rows[1]!.scheduledDeparture, "8/11/2026 7:11");
}

// 3. Already-valid schedules must not be shifted.
{
  const rows = [
    stop({ stopName: "A", stopOrder: 1, scheduledArrival: "8/11/2026 7:00", scheduledDeparture: "8/11/2026 7:05" }),
    stop({ stopName: "B", stopOrder: 2, scheduledArrival: "8/11/2026 7:20", scheduledDeparture: "8/11/2026 7:25" })
  ];
  const result = enforceMonotonicRouteSchedule(rows);
  assert.equal(result.adjustedStops, 0);
  assert.equal(rows[1]!.scheduledArrival, "8/11/2026 7:20");
}

// 4. Repair must not depend on the server timezone (Vercel runs UTC).
{
  const original = process.env.TZ;
  for (const tz of ["UTC", "America/Los_Angeles", "Asia/Tokyo"]) {
    process.env.TZ = tz;
    const rows = [
      stop({ stopName: "A", stopOrder: 1, scheduledArrival: "8/11/2026 11:45", scheduledDeparture: "8/11/2026 11:50" }),
      stop({ stopName: "B", stopOrder: 2, scheduledArrival: "8/11/2026 11:18", scheduledDeparture: "8/11/2026 11:23" })
    ];
    enforceMonotonicRouteSchedule(rows);
    assert.equal(rows[1]!.scheduledArrival, "8/11/2026 11:51", `timezone ${tz} must not shift wall-clock times`);
  }
  if (original == null) delete process.env.TZ;
  else process.env.TZ = original;
}

// 5. Legacy middle-dot separators become ASCII pipes, not run-together text.
{
  const notes = sanitizeSamsaraNotes("1 dog(s): Markley · Phone: (949) 887-9484 · Pickup: gate code 3647");
  assert.equal(notes, "1 dog(s): Markley | Phone: (949) 887-9484 | Pickup: gate code 3647");
  assert.ok(!/[^\x20-\x7E]/.test(notes), "notes must be pure ASCII");
}

// 6. Em dash from facility notes is downgraded, not dropped into a blank.
{
  const notes = sanitizeSamsaraNotes("Fitdog facility stop — 2 dog(s) already on-site: Bill, Atlas");
  assert.equal(notes, "Fitdog facility stop - 2 dog(s) already on-site: Bill, Atlas");
}

console.log("test-samsara-monotonic-schedule: ok");
