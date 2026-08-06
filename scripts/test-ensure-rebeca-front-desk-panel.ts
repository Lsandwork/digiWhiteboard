import assert from "node:assert/strict";
import {
  matchesRebecaAccount,
  pickRebecaTarget,
  rebecaHasRequiredPanelTabs,
  REBECA_REQUIRED_TABS
} from "@/lib/admin/ensure-rebeca-front-desk-panel";
import { FRONT_DESK_COORDINATOR_TABS } from "@/lib/admin/permissions";
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

assert.equal(matchesRebecaAccount(user({ full_name: "Rebeca", email: "r@fitdog.com", role: "team_leader" })), true);
assert.equal(matchesRebecaAccount(user({ full_name: "Rebecca Smith", email: "x@fitdog.com", role: "team_leader" })), true);
assert.equal(matchesRebecaAccount(user({ full_name: "Alex", email: "rebecca@fitdog.com", role: "team_leader" })), true);
assert.equal(matchesRebecaAccount(user({ full_name: "Alex", email: "alex@fitdog.com", role: "team_leader" })), false);

const picked = pickRebecaTarget([
  user({ id: "a", full_name: "Rebecca A", email: "a@fitdog.com", role: "team_leader" }),
  user({ id: "b", full_name: "Rebeca B", email: "b@fitdog.com", role: "team_leader" })
]);
assert.equal(picked?.id, "b");

assert.ok(
  REBECA_REQUIRED_TABS.every((tab) => (FRONT_DESK_COORDINATOR_TABS as readonly string[]).includes(tab))
);

assert.equal(
  rebecaHasRequiredPanelTabs(user({ full_name: "Rebeca", email: "rebeca@fitdog.com", role: "front_desk_coordinator" })),
  true
);
assert.equal(
  rebecaHasRequiredPanelTabs(user({ full_name: "Rebeca", email: "rebeca@fitdog.com", role: "team_leader" })),
  true,
  "helper projects team lead onto FDC panel tabs for ensure planning"
);

console.log("ensure rebeca front desk panel tests passed");
