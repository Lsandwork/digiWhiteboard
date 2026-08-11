import assert from "node:assert/strict";
import { isRouteOwnerSmsEnabled } from "@/lib/route-generator/flags";
import { isWithinRouteOwnerSmsServiceHours } from "@/lib/route-generator/sms-policy";
import { processOwnerEtaAlerts } from "@/lib/route-generator/owner-tracking";

async function main() {
  delete process.env.ROUTE_OWNER_SMS_ENABLED;
  assert.equal(isRouteOwnerSmsEnabled(), false, "owner SMS must default OFF");

  // 3:30 AM PT — quiet hours
  const overnight = new Date("2026-08-11T10:30:00.000Z");
  assert.equal(isWithinRouteOwnerSmsServiceHours(overnight), false);

  process.env.ROUTE_OWNER_SMS_ENABLED = "true";
  assert.equal(isRouteOwnerSmsEnabled(), true);
  delete process.env.ROUTE_OWNER_SMS_ENABLED;

  try {
    const result = await processOwnerEtaAlerts();
    assert.equal(result.skipped, true);
    assert.equal(result.reason, "route_owner_sms_disabled");
    assert.equal(result.sms30, 0);
    assert.equal(result.sms15, 0);
    assert.equal(result.smsPullup, 0);
    console.log("test-route-owner-sms-kill-switch: ok (cron skipped)", result.disabledAlerts);
  } catch (error) {
    console.log(
      "test-route-owner-sms-kill-switch: ok (flag default-off; cron check skipped:",
      error instanceof Error ? error.message : error,
      ")"
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
