import assert from "node:assert/strict";
import {
  isJasperDemoSmsEnabled,
  isWithinJasperDemoSmsWindow,
  maybeAdvanceJasperDemoSms
} from "@/lib/route-generator/jasper-demo-run";
import { readFileSync } from "node:fs";
import { join } from "node:path";

async function main() {
  assert.equal(isJasperDemoSmsEnabled(), false);
  assert.equal(isWithinJasperDemoSmsWindow(Date.now()), false);

  process.env.JASPER_DEMO_SMS_ENABLED = "true";
  assert.equal(
    isJasperDemoSmsEnabled(),
    false,
    "env flag must not re-enable Jasper demo SMS"
  );

  const morning = Date.parse("2026-08-11T16:26:00.000Z"); // 9:26am PDT
  const evening = Date.parse("2026-08-12T04:08:00.000Z"); // 9:08pm PDT

  const morningResult = await maybeAdvanceJasperDemoSms({ nowMs: morning, force: true });
  assert.equal(morningResult.skipped, true);
  assert.equal(morningResult.reason, "jasper_demo_sms_permanently_disabled");

  const eveningResult = await maybeAdvanceJasperDemoSms({ nowMs: evening, force: true });
  assert.equal(eveningResult.skipped, true);
  assert.equal(
    eveningResult.reason,
    "jasper_demo_sms_permanently_disabled",
    "9:08pm demo send must be impossible even with force"
  );

  // Production ETA cron must not import the demo sender.
  const etaCron = readFileSync(join(process.cwd(), "app/api/cron/route-eta-alerts/route.ts"), "utf8");
  assert.equal(
    /maybeAdvanceJasperDemoSms/.test(etaCron),
    false,
    "route-eta-alerts must not call Jasper demo SMS"
  );
  assert.equal(
    /jasper-demo-run/.test(etaCron),
    false,
    "route-eta-alerts must not import jasper-demo-run"
  );

  const trackApi = readFileSync(join(process.cwd(), "app/api/track/[token]/route.ts"), "utf8");
  assert.equal(
    /maybeAdvanceJasperDemoSms|jasper-demo-run/.test(trackApi),
    false,
    "public track API must not advance Jasper demo SMS"
  );

  delete process.env.JASPER_DEMO_SMS_ENABLED;
  console.log("test-jasper-demo-sms-guards: ok (9:08pm demo path permanently dead)");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
