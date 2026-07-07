import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { requireDatabasePassword } from "./load-env-local";

const PROJECT_REF = "tzkocaucqtmmnrttxira";

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env
  });
  return result.status ?? 0;
}

const password = requireDatabasePassword();
process.env.SUPABASE_DB_PASSWORD = password;

console.log("Refreshing Supabase link with database password from .env.local...");
run("npx", [
  "supabase",
  "link",
  "--project-ref",
  PROJECT_REF,
  "--password",
  password,
  "--yes"
]);

console.log("Pushing migrations...");
const pushStatus = run("npx", ["supabase", "db", "push", "--linked", "--yes", "--password", password]);

if (pushStatus !== 0) {
  console.error("\nDatabase password was rejected by Supabase.");
  console.error("Fix: Supabase Dashboard → Project Settings → Database → reset password to match .env.local");
  console.error("Or apply just the demo-accounts migration without a DB password:");
  console.error("  npm run db:push:query\n");
  process.exit(pushStatus);
}
