/**
 * Ensure Angelica’s DigiBoard account can open Active Issues.
 *
 * Usage:
 *   npx tsx scripts/ensure-angelica-active-issues.ts
 *   npx tsx scripts/ensure-angelica-active-issues.ts --apply
 */
import { loadEnvFiles } from "./load-env-local";

loadEnvFiles();

import { canAccessAdminTab, accessFromLegacyRole } from "@/lib/admin/permissions";
import {
  ANGELICA_REQUIRED_TABS,
  ensureAngelicaActiveIssues,
  matchesAngelicaAccount,
  pickAngelicaTarget,
  roleAlreadyHasActiveIssues
} from "@/lib/admin/ensure-angelica-active-issues";
import { listAdminUsers } from "@/lib/admin/users";
import { getServiceSupabase } from "@/lib/supabase/server";

const APPLY = process.argv.includes("--apply");

async function main() {
  const supabase = getServiceSupabase();
  const users = await listAdminUsers(supabase);
  const matches = users.filter(matchesAngelicaAccount);
  const target = pickAngelicaTarget(matches);

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
    throw new Error("No Angelica admin_users row found.");
  }

  const projectedRole = roleAlreadyHasActiveIssues(target.role) ? target.role : "front_desk_coordinator";
  const access = accessFromLegacyRole(target.id, target.email, projectedRole);
  const tabAccess = Object.fromEntries(
    ANGELICA_REQUIRED_TABS.map((tab) => [tab, canAccessAdminTab(access, tab, projectedRole, "staff")])
  );

  console.log("\nTarget account:", {
    id: target.id,
    full_name: target.full_name,
    email: target.email,
    current_role: target.role,
    projected_role: projectedRole,
    tabAccess
  });

  if (!APPLY) {
    console.log("\nDry run only. Re-run with --apply to update Angelica’s role/access.");
    return;
  }

  const result = await ensureAngelicaActiveIssues(supabase, { force: true });
  console.log("\nEnsure result:", result);
  console.log("\nDone. Angelica should now see Active Issues.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
