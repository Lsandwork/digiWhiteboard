/**
 * Apply track_incidents migration + initial webhook inbox backfill.
 * Run: npx tsx scripts/apply-track-incidents-migration.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import { syncIncidentsFromWebhookInbox } from "../lib/staff/track-incidents/sync";
import { getServiceSupabase } from "../lib/supabase/server";
import { loadEnvFiles } from "./load-env-local";

async function main() {
  loadEnvFiles();
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!password) throw new Error("Missing SUPABASE_DB_PASSWORD");

  const ref = "tzkocaucqtmmnrttxira";
  const client = new Client({
    connectionString: `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  const sql = readFileSync(
    resolve(__dirname, "../supabase/migrations/039_track_incidents.sql"),
    "utf8"
  );
  await client.query(sql);
  console.log("Migration 039_track_incidents applied.");
  await client.end();

  const supabase = getServiceSupabase();
  const run = await syncIncidentsFromWebhookInbox(supabase, { trigger: "manual", force: true });
  console.log("Backfill sync:", run);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
