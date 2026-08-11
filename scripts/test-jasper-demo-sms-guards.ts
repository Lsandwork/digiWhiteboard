import assert from "node:assert/strict";
import {
  formatJasperDepartLabel,
  isJasperDemoSmsEnabled,
  isWithinJasperDemoSmsWindow,
  jasperDemoDepartAtMs,
  laMinutesSinceMidnight,
  maybeAdvanceJasperDemoSms,
  todayLa
} from "@/lib/route-generator/jasper-demo-run";

async function main() {
  // Default: demo SMS must be OFF (production-safe).
  delete process.env.JASPER_DEMO_SMS_ENABLED;
  assert.equal(isJasperDemoSmsEnabled(), false);

  const morning = Date.parse("2026-08-11T16:26:00.000Z"); // 9:26am PDT
  assert.ok(laMinutesSinceMidnight(morning) < 12 * 60, "fixture should be morning PT");
  assert.equal(isWithinJasperDemoSmsWindow(morning), false, "morning must be outside demo window");

  const evening = Date.parse("2026-08-12T04:10:00.000Z"); // 9:10pm PDT
  assert.ok(isWithinJasperDemoSmsWindow(evening), "9:10pm PT must be inside demo window");

  const depart = jasperDemoDepartAtMs(morning);
  assert.equal(todayLa(morning), "2026-08-11");
  assert.match(formatJasperDepartLabel(depart), /9:08pm/i);

  const disabled = await maybeAdvanceJasperDemoSms({ nowMs: morning });
  assert.equal(disabled.skipped, true);
  assert.equal(disabled.reason, "jasper_demo_sms_disabled");

  process.env.JASPER_DEMO_SMS_ENABLED = "true";
  assert.equal(isJasperDemoSmsEnabled(), true);

  const outside = await maybeAdvanceJasperDemoSms({ nowMs: morning });
  assert.equal(outside.skipped, true);
  assert.equal(
    outside.reason,
    "outside_demo_evening_window",
    "even when enabled, morning must not send 9:08pm departing SMS"
  );

  delete process.env.JASPER_DEMO_SMS_ENABLED;

  console.log("test-jasper-demo-sms-guards: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
