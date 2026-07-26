/**
 * One-shot Fitdog sync using the native activity-stream provider + service role.
 * Usage: npx tsx scripts/run-fitdog-native-sync.ts
 */
import { loadEnvFiles } from "./load-env-local";
import { createClient } from "@supabase/supabase-js";
import { runFitdogSync } from "../lib/fitdog-ops/sync";
import { updateFitdogIntegrationSettings } from "../lib/fitdog-ops/store";

loadEnvFiles();

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  await updateFitdogIntegrationSettings(supabase, { integration_mode: "api" }, null);
  const started = Date.now();
  const run = await runFitdogSync(supabase, {
    trigger: "backfill",
    mode: "backfill",
    force: true
  });
  console.log(
    JSON.stringify(
      {
        ms: Date.now() - started,
        id: run.id,
        status: run.status,
        records_scanned: run.records_scanned,
        alerts_created: run.alerts_created,
        alerts_updated: run.alerts_updated,
        alerts_resolved: run.alerts_resolved,
        message: run.message,
        error_details: run.error_details
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
