/**
 * Bark Out posting eligibility and baseline participant permissions.
 * Run: npx tsx scripts/test-bark-out-posting.ts
 */
import assert from "node:assert/strict";
import { accessFromLegacyRole } from "@/lib/admin/permissions";
import { buildEngagementActor } from "@/lib/team-engagement/authorize";
import { barkOutPostingState } from "@/lib/team-engagement/bark-out-posting";
import { effectiveEngagementPermissions } from "@/lib/team-engagement/permissions";

function actorForLegacy(role: string, impersonated = false) {
  const access = accessFromLegacyRole(`id-${role}`, `${role}@fitdog.test`, role);
  return buildEngagementActor({
    identity: {
      userId: `id-${role}`,
      name: "Pat",
      email: `${role}@fitdog.test`,
      legacyRole: role,
      status: "active"
    },
    access,
    managedDepartments: [],
    impersonated
  });
}

const handler = actorForLegacy("dog_handler");
assert.ok(handler.permissions.includes("engagement.create_bark_out"), "handler keeps create_bark_out from role defaults");
assert.equal(barkOutPostingState(handler).canPost, true);

const stripped = buildEngagementActor({
  identity: {
    userId: "id-x",
    name: "Pat",
    email: "x@fitdog.test",
    legacyRole: "dog_handler",
    status: "active"
  },
  access: { ...accessFromLegacyRole("id-x", "x@fitdog.test", "dog_handler"), permissions: [] },
  managedDepartments: [],
  impersonated: false
});
assert.ok(stripped.permissions.includes("engagement.create_bark_out"), "baseline merge restores participant permissions");

const impersonating = actorForLegacy("dog_handler", true);
assert.equal(barkOutPostingState(impersonating).canPost, false);
assert.equal(barkOutPostingState(impersonating).blockedReason, "impersonated");

const participateOnly = effectiveEngagementPermissions({
  userId: "id-p",
  email: "p@fitdog.test",
  primaryRole: "groomer",
  roles: ["groomer"],
  departments: [],
  permissions: ["engagement.participate"],
  displayLabel: "Groomer"
});
assert.ok(participateOnly.includes("engagement.create_bark_out"), "participate implies create_bark_out for API checks");

console.log("test-bark-out-posting: ok");