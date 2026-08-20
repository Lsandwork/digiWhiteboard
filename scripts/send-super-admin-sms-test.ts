/**
 * Send a test Super Admin SMS alert to every configured ops alert recipient.
 * Usage: npx tsx scripts/send-super-admin-sms-test.ts
 */
import { resolveSuperAdminPhones, sendSuperAdminSmsAlert } from "../lib/staff/super-admin-sms";

async function main() {
  const phones = await resolveSuperAdminPhones();
  console.log("Alert recipients:", phones);

  if (!phones.length) {
    throw new Error("No Super Admin SMS recipients configured.");
  }

  const stamp = new Date().toISOString();
  const result = await sendSuperAdminSmsAlert({
    kind: "fitdog_alert",
    title: "Test alert (RuffOps)",
    detail: `Multi-recipient SMS test at ${stamp}. Reply STOP only if this is your personal phone on file.`,
    idempotencyKey: `sa-sms:test:${stamp}`,
    adminPath: "/admin?board=staff&tab=ops_command_center"
  });

  console.log(JSON.stringify({ recipients: phones, result }, null, 2));
  if (!result.ok && !result.skipped) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
