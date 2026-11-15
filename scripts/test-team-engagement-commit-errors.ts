/**
 * Commit allowlist failures must not be reported as migration 103.
 * Run: npx tsx scripts/test-team-engagement-commit-errors.ts
 */
import assert from "node:assert/strict";
import {
  isCommitAllowlistError,
  isMissingRelationError,
  mapDbError,
  setupRequiredError
} from "@/lib/team-engagement/errors";
import { PACK_PRIORITY2_COMMIT, TEAM_ENGAGEMENT_MIGRATION, TEMPLATE_LIBRARY_COMMIT } from "@/lib/team-engagement/constants";

const allowlist = {
  code: "42501",
  message: "team_engagement_commit: table team_engagement_fun_polls is not allowed."
};
assert.equal(isCommitAllowlistError(allowlist), true);
assert.equal(isMissingRelationError(allowlist), false);
const mapped = mapDbError(allowlist);
assert.equal(mapped.code, "setup_required");
assert.match(mapped.message, /106_team_engagement_commit_pack_tables/);
assert.doesNotMatch(mapped.message, new RegExp(TEAM_ENGAGEMENT_MIGRATION.replace(/\./g, "\\.")));

const templateAllowlist = {
  code: "42501",
  message: "team_engagement_commit: table team_engagement_template_publications is not allowed."
};
const templateMapped = mapDbError(templateAllowlist);
assert.equal(templateMapped.code, "setup_required");
assert.match(templateMapped.message, /112_team_engagement_commit_templates/);
assert.doesNotMatch(templateMapped.message, new RegExp(TEAM_ENGAGEMENT_MIGRATION.replace(/\./g, "\\.")));

const missingFn = { code: "PGRST202", message: "Could not find the function public.team_engagement_commit" };
assert.equal(isMissingRelationError(missingFn), true);
assert.equal(mapDbError(missingFn).message, setupRequiredError().message);

console.log("team-engagement-commit-errors: ok");