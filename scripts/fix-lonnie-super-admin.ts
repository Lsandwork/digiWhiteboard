/**
 * Unify Super Admin as Lonnie Sandoval (lonnie@fitdog.com).
 *
 * Usage:
 *   npx tsx scripts/fix-lonnie-super-admin.ts
 *   npx tsx scripts/fix-lonnie-super-admin.ts --apply
 */
import { loadEnvFiles } from "./load-env-local";

loadEnvFiles();

import { syncUserAccessFromLegacyRole } from "@/lib/admin/user-access";
import { findAdminUserByEmail, listAdminUsers, updateAdminUser } from "@/lib/admin/users";
import {
  createStaffDirectoryMember,
  listStaffOps,
  updateStaffDirectoryMember
} from "@/lib/staff/admin-ops";
import { getServiceSupabase } from "@/lib/supabase/server";

const APPLY = process.argv.includes("--apply");
const TARGET_NAME = "Lonnie Sandoval";
const TARGET_EMAIL = "lonnie@fitdog.com";
const TARGET_PHONE = "213-913-1391";
const TARGET_ROLE = "owner_admin" as const;
const ACTOR = "script:fix-lonnie-super-admin";

function normEmail(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

async function main() {
  const supabase = getServiceSupabase();
  const users = await listAdminUsers(supabase);
  const matches = users.filter((user) => {
    const email = normEmail(user.email);
    const name = user.full_name.trim().toLowerCase();
    return (
      email === "admin" ||
      email === "admin@fitdog.com" ||
      email === TARGET_EMAIL ||
      email.startsWith("admin@") ||
      name.includes("lonnie") ||
      name === "admin"
    );
  });

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
        })),
        env_admin_username: process.env.ADMIN_USERNAME ?? "(unset → defaults to admin)"
      },
      null,
      2
    )
  );

  let lonnie = await findAdminUserByEmail(supabase, TARGET_EMAIL);
  const adminAlias = matches.find((user) => {
    const email = normEmail(user.email);
    return email === "admin" || email === "admin@fitdog.com" || email.startsWith("admin@");
  });

  if (!lonnie && adminAlias) {
    lonnie = adminAlias;
  }
  if (!lonnie) {
    throw new Error(`No Lonnie / admin account found to promote. Searched for ${TARGET_EMAIL}.`);
  }

  console.log("\nPrimary account before:", {
    id: lonnie.id,
    full_name: lonnie.full_name,
    email: lonnie.email,
    role: lonnie.role,
    status: lonnie.status
  });

  if (!APPLY) {
    console.log("\nDry run only. Re-run with --apply to write changes.");
    return;
  }

  // If Lonnie email exists on a different row than the admin alias, keep Lonnie's row
  // and demote/disable the leftover admin alias so there is one Super Admin identity.
  const keepId = (await findAdminUserByEmail(supabase, TARGET_EMAIL))?.id ?? lonnie.id;
  const keep = users.find((user) => user.id === keepId) ?? lonnie;

  await updateAdminUser(supabase, keep.id, {
    full_name: TARGET_NAME,
    email: TARGET_EMAIL,
    role: TARGET_ROLE,
    status: "active",
    force_password_change: keep.force_password_change
  });
  await syncUserAccessFromLegacyRole(supabase, keep.id, TARGET_ROLE, "Management");

  for (const other of matches) {
    if (other.id === keep.id) continue;
    const otherEmail = normEmail(other.email);
    if (otherEmail === TARGET_EMAIL) continue;
    // Avoid email unique collision: park old admin alias, keep Lonnie as sole super admin.
    const parkedEmail = `disabled-admin-alias+${other.id.slice(0, 8)}@fitdog.com`;
    await updateAdminUser(supabase, other.id, {
      full_name: other.full_name.includes("Lonnie") ? other.full_name : `${other.full_name} (merged)`,
      email: parkedEmail,
      role: "viewer",
      status: "disabled",
      force_password_change: true
    });
    console.log(`Disabled duplicate account ${other.email} → ${parkedEmail}`);
  }

  const state = await listStaffOps(supabase);
  const directoryMatch = state.staff_directory.find(
    (member) =>
      member.admin_user_id === keep.id ||
      normEmail(member.email) === TARGET_EMAIL ||
      member.name.trim().toLowerCase().includes("lonnie")
  );

  if (directoryMatch) {
    await updateStaffDirectoryMember(
      supabase,
      directoryMatch.id,
      {
        name: TARGET_NAME,
        email: TARGET_EMAIL,
        phone: TARGET_PHONE,
        role: "Super Admin",
        department: "Management",
        status: "Active",
        dashboard_role: TARGET_ROLE,
        admin_user_id: keep.id
      },
      ACTOR,
      keep.id
    );
    console.log(`Updated staff directory: ${directoryMatch.id}`);
  } else {
    await createStaffDirectoryMember(
      supabase,
      {
        name: TARGET_NAME,
        email: TARGET_EMAIL,
        phone: TARGET_PHONE,
        role: "Super Admin",
        department: "Management",
        status: "Active",
        dashboard_role: TARGET_ROLE,
        admin_user_id: keep.id
      },
      ACTOR,
      keep.id
    );
    console.log("Created staff directory row for Lonnie Sandoval");
  }

  const after = await findAdminUserByEmail(supabase, TARGET_EMAIL);
  console.log("\nPrimary account after:", {
    id: after?.id,
    full_name: after?.full_name,
    email: after?.email,
    role: after?.role,
    status: after?.status
  });
  console.log("\nDone. Super Admin is Lonnie Sandoval (lonnie@fitdog.com). Login aliases: admin, lonnie@fitdog.com.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
