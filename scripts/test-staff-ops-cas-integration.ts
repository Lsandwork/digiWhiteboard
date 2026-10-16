/**
 * PostgreSQL compare-and-swap integration tests for migration 076.
 *
 * Mutates only admin_settings key `__staff_ops_cas_integration_test__`.
 *
 * Run (local Supabase only by default):
 *   STAFF_OPS_CAS_INTEGRATION=1 npx tsx scripts/test-staff-ops-cas-integration.ts
 *
 * Staging (explicit hostname match required):
 *   STAFF_OPS_CAS_INTEGRATION=1 STAFF_OPS_CAS_INTEGRATION_HOST=your-project.supabase.co npx tsx scripts/test-staff-ops-cas-integration.ts
 */
import assert from "node:assert/strict";
import { loadEnvFiles } from "./load-env-local";
import { gateStaffOpsCasIntegration } from "../lib/admin/staff-ops-cas-integration-target";
import { getServiceSupabase } from "../lib/supabase/server";

const TEST_KEY = "__staff_ops_cas_integration_test__";

loadEnvFiles();

const gate = gateStaffOpsCasIntegration();
if (!gate.ok) {
  console.log(`test-staff-ops-cas-integration: SKIP — ${gate.reason}`);
  process.exit(0);
}

console.log(`test-staff-ops-cas-integration: target host=${gate.host} mode=${gate.mode}`);

const supabase = getServiceSupabase({ timeoutMs: 30_000 });

async function rpcAvailable(): Promise<boolean> {
  const { error } = await supabase.rpc("patch_admin_settings_json_if_revision", {
    p_key: TEST_KEY,
    p_expected_revision: 0,
    p_value: { _revision: 0, probe: true }
  });
  if (error?.code === "PGRST202" || error?.message?.includes("patch_admin_settings_json_if_revision")) {
    return false;
  }
  if (error) throw error;
  return true;
}

async function readStoredRevision(): Promise<number> {
  const { data, error } = await supabase
    .from("admin_settings")
    .select(`settings->${TEST_KEY}`)
    .eq("id", "default")
    .maybeSingle();
  if (error) throw error;
  const row = data as Record<string, unknown> | null;
  const blob = row?.[TEST_KEY] as Record<string, unknown> | undefined;
  const rev = blob?._revision;
  return typeof rev === "number" && Number.isFinite(rev) ? rev : 0;
}

async function cas(expected: number, nextRevision: number, tag: string): Promise<number | "conflict" | "unavailable"> {
  const { data, error } = await supabase.rpc("patch_admin_settings_json_if_revision", {
    p_key: TEST_KEY,
    p_expected_revision: expected,
    p_value: { _revision: nextRevision, tag }
  });
  if (error) {
    if (error.code === "PGRST202" || error.message?.includes("patch_admin_settings_json_if_revision")) return "unavailable";
    throw error;
  }
  if (typeof data === "number" && data === -1) return "conflict";
  if (typeof data === "number") return data;
  return nextRevision;
}

async function resetFixture() {
  const { error } = await supabase.rpc("patch_admin_settings_json", {
    p_key: TEST_KEY,
    p_value: { _revision: 0, tag: "reset" }
  });
  if (error && error.code !== "PGRST202" && !error.message?.includes("patch_admin_settings_json")) {
    throw error;
  }
  assert.equal(await readStoredRevision(), 0, "fixture reset to revision 0");
}

async function main() {
  assert.equal(await rpcAvailable(), true, "patch_admin_settings_json_if_revision must exist (migration 076)");

  await resetFixture();

  // 1) Current revision succeeds
  assert.equal(await cas(0, 1, "first"), 1);
  assert.equal(await readStoredRevision(), 1);

  // 2) Stale revision rejected
  assert.equal(await cas(0, 2, "stale"), "conflict");
  assert.equal(await readStoredRevision(), 1);

  // 3) Two concurrent writers with same expected revision — only one wins
  await resetFixture();
  const concurrent = await Promise.all([
    cas(0, 1, "race-a"),
    cas(0, 1, "race-b")
  ]);
  const wins = concurrent.filter((r) => r !== "conflict");
  const losses = concurrent.filter((r) => r === "conflict");
  assert.equal(wins.length, 1, "exactly one concurrent CAS wins");
  assert.equal(losses.length, 1, "exactly one concurrent CAS loses");
  assert.equal(await readStoredRevision(), 1);

  // 4) Revision increments on success
  assert.equal(await cas(1, 2, "increment"), 2);
  assert.equal(await readStoredRevision(), 2);

  // 5) Losing retry after winner already advanced
  assert.equal(await cas(1, 3, "late"), "conflict");
  assert.equal(await readStoredRevision(), 2);

  console.log("test-staff-ops-cas-integration: all assertions passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
