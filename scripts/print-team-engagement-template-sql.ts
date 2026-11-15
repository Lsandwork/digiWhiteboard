/**
 * Prints migrations 112 + 113 for copy-paste into Supabase SQL Editor.
 * npx tsx scripts/print-team-engagement-template-sql.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const files = [
  "supabase/migrations/112_team_engagement_commit_templates.sql",
  "supabase/migrations/113_team_engagement_template_grants.sql"
];

console.log("-- Team Engagement template publish fix (112 + 113)\n");
for (const rel of files) {
  console.log(`-- ----- ${rel} -----\n`);
  console.log(readFileSync(join(root, rel), "utf8").trim());
  console.log("\n");
}