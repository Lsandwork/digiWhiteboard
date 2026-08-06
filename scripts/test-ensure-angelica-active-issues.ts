import assert from "node:assert/strict";
import {
  ANGELICA_REQUIRED_TABS,
  angelicaHasActiveIssuesAccess,
  matchesAngelicaAccount,
  pickAngelicaTarget,
  roleAlreadyHasActiveIssues
} from "@/lib/admin/ensure-angelica-active-issues";
import { accessFromLegacyRole, canAccessAdminTab, TEAM_LEADER_TABS } from "@/lib/admin/permissions";
import type { AdminUserPublic } from "@/lib/admin/users";

function user(partial: Partial<AdminUserPublic> & Pick<AdminUserPublic, "full_name" | "email" | "role">): AdminUserPublic {
  return {
    id: partial.id ?? "u1",
    full_name: partial.full_name,
    email: partial.email,
    role: partial.role,
    status: partial.status ?? "active",
    force_password_change: false,
    last_login_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    created_by: null
  };
}

assert.equal(matchesAngelicaAccount(user({ full_name: "Angelica", email: "a@fitdog.com", role: "team_leader" })), true);
assert.equal(matchesAngelicaAccount(user({ full_name: "Angelica Smith", email: "x@fitdog.com", role: "groomer" })), true);
assert.equal(matchesAngelicaAccount(user({ full_name: "Alex", email: "angelica@fitdog.com", role: "groomer" })), true);
assert.equal(matchesAngelicaAccount(user({ full_name: "Alex", email: "alex@fitdog.com", role: "groomer" })), false);

const picked = pickAngelicaTarget([
  user({ id: "a", full_name: "Alex Angelica", email: "a@fitdog.com", role: "groomer" }),
  user({ id: "b", full_name: "Angelica B", email: "b@fitdog.com", role: "groomer" })
]);
assert.equal(picked?.id, "b");

assert.equal(roleAlreadyHasActiveIssues("team_leader"), true);
assert.equal(roleAlreadyHasActiveIssues("front_desk_coordinator"), true);
assert.equal(roleAlreadyHasActiveIssues("groomer"), false);

assert.ok((TEAM_LEADER_TABS as readonly string[]).includes("active_issues"));

const lead = accessFromLegacyRole("lead-1", "lead@fitdog.test", "team_leader");
assert.equal(canAccessAdminTab(lead, "active_issues", "team_leader", "staff"), true);

assert.equal(
  angelicaHasActiveIssuesAccess(user({ full_name: "Angelica", email: "angelica@fitdog.com", role: "team_leader" })),
  true
);
assert.equal(
  angelicaHasActiveIssuesAccess(user({ full_name: "Angelica", email: "angelica@fitdog.com", role: "groomer" })),
  true,
  "helper projects groomer onto FDC for ensure planning"
);

assert.ok(ANGELICA_REQUIRED_TABS.includes("active_issues"));

console.log("ensure angelica active issues tests passed");
