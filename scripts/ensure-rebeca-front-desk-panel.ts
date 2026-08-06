/**
 * Ensure Rebeca’s DigiBoard panel includes Fitdog Alerts, Walks Board,
 * Vet Visits, and Track Incidents by setting her role to Front Desk Coordinator
 * and syncing user-access assignments.
 *
 * Usage:
 *   npx tsx scripts/ensure-rebeca-front-desk-panel.ts
 *   npx tsx scripts/ensure-rebeca-front-desk-panel.ts --apply
 */
import { loadEnvFiles } from "./load-env-local";

loadEnvFiles();

import {
  canAccessAdminTab,
  accessFromLegacyRole,
  FRONT_DESK_COORDINATOR_TABS
} from "@/lib/admin/permissions";
import {
  ensureRebecaFrontDeskPanel,
  matchesRebecaAccount,
  pickRebecaTarget,
  REBECA_REQUIRED_TABS
} from "@/lib/admin/ensure-rebeca-front-desk-panel";
import { listAdminUsers } from "@/lib/admin/users";
import { getServiceSupabase } from "@/lib/supabase/server";

const APPLY = process.argv.includes("--apply");
const TARGET_ROLE = "front_desk_coordinator" as const;

async function main() {
  const supabase = getServiceSupabase();
  const users = await listAdminUsers(supabase);
  const matches = users.filter(matchesRebecaAccount);
  const target = pickRebecaTarget(matches);

  console.log(
    JSON.stringify(
      {
        mode: APPLY ? "apply" : "dry-run",
        matches: matches.map((user) => ({
          id: user.id,
          full_name: user.full_name,
          email: user.email,
          role: user.role,
          status: user.status
        }))
      },
      null,
      2
    )
  );

  if (!target) {
    throw new Error("No Rebeca/Rebecca admin_users row found.");
  }

  const access = accessFromLegacyRole(target.id, target.email, TARGET_ROLE);
  const tabAccess = Object.fromEntries(
    REBECA_REQUIRED_TABS.map((tab) => [tab, canAccessAdminTab(access, tab, TARGET_ROLE, "staff")])
  );
  const missingFromRoleTabs = REBECA_REQUIRED_TABS.filter(
    (tab) => !(FRONT_DESK_COORDINATOR_TABS as readonly string[]).includes(tab)
  );

  console.log("\nTarget account:", {
    id: target.id,
    full_name: target.full_name,
    email: target.email,
    current_role: target.role,
    target_role: TARGET_ROLE,
    tabAccess,
    missingFromRoleTabs
  });

  if (missingFromRoleTabs.length) {
    throw new Error(`FRONT_DESK_COORDINATOR_TABS is missing: ${missingFromRoleTabs.join(", ")}`);
  }

  if (!APPLY) {
    console.log("\nDry run only. Re-run with --apply to update Rebeca’s role/access.");
    return;
  }

  const result = await ensureRebecaFrontDeskPanel(supabase, { force: true });
  console.log("\nEnsure result:", result);
  console.log("\nDone. Rebeca should now see Fitdog Alerts, Walks Board, Vet Visits, and Track Incidents.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
