import assert from "node:assert/strict";
import { isAuthorizedCron } from "../lib/cron-auth";

function req(headers: Record<string, string>) {
  return new Request("https://staff.ruffops.com/api/cron/test", { headers });
}

const originalSecret = process.env.CRON_SECRET;
const originalVercelEnv = process.env.VERCEL_ENV;

try {
  process.env.CRON_SECRET = "test-secret";
  delete process.env.VERCEL_ENV;

  assert.equal(isAuthorizedCron(req({ authorization: "Bearer test-secret" })), true);
  assert.equal(
    isAuthorizedCron(req({ "x-vercel-cron": "1" })),
    false,
    "must not trust spoofable cron header when secret is set"
  );
  assert.equal(isAuthorizedCron(req({ authorization: "Bearer wrong" })), false);
  assert.equal(isAuthorizedCron(req({})), false);

  delete process.env.CRON_SECRET;
  process.env.VERCEL_ENV = "production";
  assert.equal(
    isAuthorizedCron(req({ "x-vercel-cron": "1" })),
    false,
    "fail closed in production without secret"
  );

  delete process.env.VERCEL_ENV;
  // Without CRON_SECRET and outside Vercel production, local/dev may use the cron header.
  // Force the production gate off via VERCEL_ENV absence; if NODE_ENV is already production
  // (Next typecheck), assert the fail-closed path instead.
  if (process.env.NODE_ENV === "production") {
    assert.equal(isAuthorizedCron(req({ "x-vercel-cron": "1" })), false);
  } else {
    assert.equal(isAuthorizedCron(req({ "x-vercel-cron": "1" })), true, "dev may use vercel cron header");
    assert.equal(isAuthorizedCron(req({})), false);
  }

  console.log("test-cron-auth: ok");
} finally {
  if (originalSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalSecret;
  if (originalVercelEnv === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = originalVercelEnv;
}
