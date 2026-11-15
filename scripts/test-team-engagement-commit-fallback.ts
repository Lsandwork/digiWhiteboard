import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isCommitAllowlistError } from "@/lib/team-engagement/errors";
import { executeCommitOpsDirect } from "@/lib/team-engagement/db";

const dbSource = readFileSync(join(process.cwd(), "lib/team-engagement/db.ts"), "utf8");
assert.match(dbSource, /isCommitAllowlistError\(error\)/);
assert.match(dbSource, /executeCommitOpsDirect\(supabase, ops\)/);
assert.equal(typeof executeCommitOpsDirect, "function");

const allowlist = {
  code: "42501",
  message: "team_engagement_commit: table team_engagement_template_publications is not allowed."
};
assert.equal(isCommitAllowlistError(allowlist), true);

console.log("team-engagement-commit-fallback: ok");