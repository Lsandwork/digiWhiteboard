import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { loadEnvFiles } from "./load-env-local";

const DEFAULT_MIGRATION = "025_demo_role_accounts.sql";

function runSupabaseQuery(sqlFile: string) {
  const result = spawnSync(
    "npx",
    ["supabase", "db", "query", "--linked", "-f", sqlFile],
    { stdio: "inherit", env: process.env }
  );
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function main() {
  loadEnvFiles();
  const migrationFile = process.argv[2] ?? DEFAULT_MIGRATION;
  const migrationPath = resolve(process.cwd(), "supabase/migrations", migrationFile);

  console.log(`Applying ${migrationFile} via Supabase CLI (access token, no DB password)...`);
  runSupabaseQuery(migrationPath);
  console.log(`Migration ${migrationFile} applied successfully.`);
}

main();
