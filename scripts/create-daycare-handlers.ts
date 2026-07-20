/**
 * Create Dog Handler (daycare) login accounts + Staff Directory rows.
 *
 * Usage:
 *   npx tsx scripts/create-daycare-handlers.ts
 */
import { loadEnvFiles } from "./load-env-local";

loadEnvFiles();

import {
  changeAdminUserPassword,
  createAdminUser,
  findAdminUserByEmail,
  updateAdminUser,
  type AdminUserRole
} from "@/lib/admin/users";
import { syncUserAccessFromLegacyRole } from "@/lib/admin/user-access";
import { createStaffDirectoryMember, listStaffOps, updateStaffDirectoryMember } from "@/lib/staff/admin-ops";
import { getServiceSupabase } from "@/lib/supabase/server";

const TEMP_PASSWORD = "password123";
const ROLE: AdminUserRole = "daycare";
const DEPARTMENT = "Daycare";
const JOB_TITLE = "Dog Handler";

const PEOPLE = [
  "Maggie",
  "Ricardo",
  "Tracy",
  "Anderson",
  "Josh",
  "Abraham",
  "Daniela",
  "David",
  "Henry",
  "Zusset"
] as const;

function emailFor(name: string) {
  return `${name.toLowerCase()}@fitdog.com`;
}

function displayName(name: string) {
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

async function ensureHandler(name: string) {
  const supabase = getServiceSupabase();
  const fullName = displayName(name);
  const email = emailFor(name);
  const actor = "script:create-daycare-handlers";

  let user = await findAdminUserByEmail(supabase, email);
  if (!user) {
    user = await createAdminUser(supabase, {
      full_name: fullName,
      email,
      password: TEMP_PASSWORD,
      role: ROLE,
      force_password_change: true,
      created_by: null
    });
    console.log(`  created login ${email}`);
  } else {
    await updateAdminUser(supabase, user.id, {
      full_name: fullName,
      role: ROLE,
      status: "active",
      force_password_change: true
    });
    await changeAdminUserPassword(supabase, user.id, TEMP_PASSWORD, true);
    user = (await findAdminUserByEmail(supabase, email))!;
    console.log(`  updated login ${email} (reset password + force change)`);
  }

  await syncUserAccessFromLegacyRole(supabase, user.id, ROLE, DEPARTMENT);

  const state = await listStaffOps(supabase);
  const existingMember = state.staff_directory.find(
    (member) => (member.email ?? "").trim().toLowerCase() === email || member.admin_user_id === user.id
  );

  if (existingMember) {
    await updateStaffDirectoryMember(
      supabase,
      existingMember.id,
      {
        name: fullName,
        email,
        role: JOB_TITLE,
        department: DEPARTMENT,
        status: "Active",
        dashboard_role: ROLE,
        admin_user_id: user.id
      },
      actor,
      user.id
    );
    console.log(`  updated staff directory: ${fullName}`);
  } else {
    await createStaffDirectoryMember(
      supabase,
      {
        name: fullName,
        email,
        role: JOB_TITLE,
        department: DEPARTMENT,
        status: "Active",
        dashboard_role: ROLE
        // no temp_password — login already exists and is linked by email
      },
      actor,
      user.id
    );
    console.log(`  added staff directory: ${fullName}`);
  }

  return { email, fullName, userId: user.id };
}

async function main() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  }

  console.log(`Creating ${PEOPLE.length} Dog Handler accounts (password: ${TEMP_PASSWORD}, force change on login)...\n`);

  const results = [];
  for (const person of PEOPLE) {
    console.log(`• ${displayName(person)}`);
    results.push(await ensureHandler(person));
  }

  console.log("\nDone. Accounts:");
  for (const row of results) {
    console.log(`  ${row.fullName.padEnd(12)} ${row.email}  id=${row.userId}`);
  }
  console.log("\nThey must change password on first login. They appear in Staff Directory as Dog Handler / Daycare.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
