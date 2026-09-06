import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyExternalStaffSync,
  isPlaceholderDirectoryMember,
  isSuspiciouslyPartialStaffSync,
  memberFromAdminUser,
  restorePersistentStaffRoster,
  visibleStaffDirectory,
  type StaffDirectoryRecord
} from "../lib/staff/directory-persistence";

const now = "2026-04-01T12:00:00.000Z";

function member(partial: Partial<StaffDirectoryRecord> & Pick<StaffDirectoryRecord, "id" | "name">): StaffDirectoryRecord {
  return {
    role: "Staff",
    department: "Front Desk",
    email: null,
    phone: null,
    status: "Active",
    notes: null,
    checklist_items: null,
    admin_user_id: null,
    dashboard_role: null,
    external_id: null,
    deleted_at: null,
    deleted_by: null,
    created_at: now,
    updated_at: now,
    ...partial
  };
}

const existing = [
  member({ id: "staff-1", name: "Alex", email: "alex@fitdog.com", external_id: "ext-alex" }),
  member({ id: "staff-2", name: "Sam", email: "sam@fitdog.com", status: "Inactive" }),
  member({ id: "staff-3", name: "Riley", email: "riley@fitdog.com" })
];

// TEST 1: missing from external sync remains
{
  const result = applyExternalStaffSync(existing, [
    { external_id: "ext-alex", name: "Alex", email: "alex@fitdog.com" },
    { name: "Sam", email: "sam@fitdog.com" }
  ]);
  assert.equal(result.members.some((row) => row.id === "staff-3" && !row.deleted_at), true);
  assert.equal(result.skippedDeletions >= 1, true);
  assert.equal(visibleStaffDirectory(result.members).length, 3);
}

// TEST 2: new external staff is added
{
  const result = applyExternalStaffSync(existing, [
    { name: "Alex", email: "alex@fitdog.com" },
    { name: "Sam", email: "sam@fitdog.com" },
    { name: "Riley", email: "riley@fitdog.com" },
    { name: "Jordan", email: "jordan@fitdog.com", external_id: "ext-jordan" }
  ]);
  assert.equal(result.added, 1);
  assert.equal(result.members.some((row) => row.email === "jordan@fitdog.com"), true);
}

// TEST 3: matching external staff updates fields
{
  const result = applyExternalStaffSync(existing, [
    { external_id: "ext-alex", name: "Alexandra", email: "alex@fitdog.com", phone: "555-0100", department: "Training" }
  ], { now: "2026-04-02T12:00:00.000Z" });
  const alex = result.members.find((row) => row.id === "staff-1");
  assert.equal(alex?.name, "Alexandra");
  assert.equal(alex?.phone, "555-0100");
  assert.equal(alex?.department, "Training");
  assert.equal(result.members.some((row) => row.id === "staff-2"), true);
  assert.equal(result.members.some((row) => row.id === "staff-3"), true);
}

// TEST 4: failed API does not change roster
{
  const result = applyExternalStaffSync(existing, null, { failed: true });
  assert.equal(result.skipped, true);
  assert.equal(result.reason, "api_failed");
  assert.equal(result.members.length, existing.length);
  assert.deepEqual(
    result.members.map((row) => row.id).sort(),
    existing.map((row) => row.id).sort()
  );
}

// TEST 5: partial list does not delete the missing majority
{
  assert.equal(isSuspiciouslyPartialStaffSync(50, 2), true);
  const large = Array.from({ length: 20 }, (_, i) =>
    member({ id: `staff-${i}`, name: `Person ${i}`, email: `p${i}@fitdog.com` })
  );
  const result = applyExternalStaffSync(large, [
    { name: "Person 0", email: "p0@fitdog.com", phone: "1" },
    { name: "Person 1", email: "p1@fitdog.com" }
  ]);
  assert.equal(result.reason, "partial_response");
  assert.equal(visibleStaffDirectory(result.members).length, 20);
  assert.equal(result.members.find((row) => row.id === "staff-0")?.phone, "1");
}

// TEST 6: no recent activity is not a reason to hide anyone
{
  const stale = member({
    id: "quiet",
    name: "Quiet Staff",
    email: "quiet@fitdog.com",
    updated_at: "2020-01-01T00:00:00.000Z"
  });
  const restored = restorePersistentStaffRoster({
    tableRows: [stale],
    jsonMembers: [],
    adminUsers: []
  });
  assert.equal(visibleStaffDirectory(restored.members).some((row) => row.id === "quiet"), true);
}

// TEST 7: inactive remains visible unless archived
{
  const inactive = existing[1];
  assert.equal(inactive.status, "Inactive");
  assert.equal(visibleStaffDirectory(existing).some((row) => row.id === "staff-2"), true);
  const archived = member({
    id: "gone",
    name: "Gone",
    email: "gone@fitdog.com",
    deleted_at: now,
    deleted_by: "admin"
  });
  assert.equal(visibleStaffDirectory([archived]).length, 0);
}

// TEST 8: explicit admin archive is the only removal
{
  const withArchived = [
    ...existing,
    member({ id: "archived-1", name: "Leaver", email: "leaver@fitdog.com", deleted_at: now, deleted_by: "owner" })
  ];
  const result = applyExternalStaffSync(withArchived, [
    { name: "Leaver", email: "leaver@fitdog.com", external_id: "should-not-revive" }
  ]);
  const leaver = result.members.find((row) => row.id === "archived-1");
  assert.equal(leaver?.deleted_at, now);
  assert.equal(visibleStaffDirectory(result.members).some((row) => row.id === "archived-1"), false);
}

// TEST 9: restore union keeps complete roster after cache-like empty JSON
{
  const tableRows = existing;
  const restored = restorePersistentStaffRoster({
    tableRows,
    jsonMembers: [],
    adminUsers: []
  });
  assert.equal(visibleStaffDirectory(restored.members).length, 3);
}

{
  const placeholders = [
    {
      id: "default-staff-1",
      name: "Front Desk Team",
      department: "Front Desk",
      email: null,
      admin_user_id: null,
      phone: null
    }
  ];
  assert.equal(isPlaceholderDirectoryMember(placeholders[0]), true);
  const restored = restorePersistentStaffRoster({
    tableRows: [],
    jsonMembers: placeholders,
    adminUsers: [
      { id: "u1", full_name: "Lonnie", email: "lonnie@fitdog.com", role: "owner_admin", status: "active" },
      { id: "u2", full_name: "Demo", email: "owner@demo.com", role: "viewer", status: "active" }
    ]
  });
  assert.equal(restored.recoveredFromJson, 0);
  assert.equal(restored.recoveredFromAdminUsers, 1);
  assert.equal(visibleStaffDirectory(restored.members).some((row) => row.email === "lonnie@fitdog.com"), true);
  assert.equal(visibleStaffDirectory(restored.members).some((row) => row.email === "owner@demo.com"), false);
}

{
  const seeded = memberFromAdminUser({
    id: "u9",
    full_name: "Pat",
    email: "pat@fitdog.com",
    role: "daycare",
    status: "disabled"
  });
  assert.equal(seeded.status, "Inactive");
  assert.equal(seeded.department, "Daycare");
  assert.equal(visibleStaffDirectory([seeded]).length, 1);
}

{
  const restored = restorePersistentStaffRoster({
    tableRows: [],
    jsonMembers: [
      { id: "json-1", name: "Halle", email: "halle@fitdog.com", department: "Front Desk", status: "Active" },
      { id: "json-2", name: "Was Deleted", email: "was@fitdog.com", department: "Daycare", status: "Active" }
    ],
    adminUsers: [],
    activityLogs: [{ activity_type: "staff_directory.deleted", source_id: "json-2" }]
  });
  assert.equal(restored.recoveredFromJson, 1);
  assert.equal(restored.members.some((row) => row.id === "json-2"), false);
}

const adminOps = readFileSync(join(process.cwd(), "lib/staff/admin-ops.ts"), "utf8");
assert.match(adminOps, /listVisibleStaffDirectory/);
assert.match(adminOps, /patch_staff_admin_ops_preserve_directory/);
assert.match(adminOps, /staff_directory: \[\]/);
assert.doesNotMatch(adminOps, /staff_directory: DEFAULT_STAFF_DIRECTORY/);
assert.match(adminOps, /archiveStaffDirectoryRecord/);
assert.doesNotMatch(adminOps, /deleteAdminUserByEmail/);

const store = readFileSync(join(process.cwd(), "lib/staff/directory-store.ts"), "utf8");
assert.match(store, /syncExternalStaffIntoDirectory/);
assert.match(store, /deleted_at/);
assert.match(store, /PAGE_SIZE = 1000/);
assert.match(store, /roster unchanged/);

const migration = readFileSync(join(process.cwd(), "supabase/migrations/090_staff_directory_persistence.sql"), "utf8");
assert.match(migration, /prevent_staff_directory_hard_delete/);
assert.match(migration, /patch_staff_admin_ops_preserve_directory/);
assert.match(migration, /deleted_at/);
assert.match(migration, /from public.admin_users/);

const panel = readFileSync(join(process.cwd(), "components/admin/StaffDirectoryPanel.tsx"), "utf8");
assert.match(panel, /All staff/);
assert.match(panel, /roster=1/);
assert.match(panel, /Archive this staff member/);

const route = readFileSync(join(process.cwd(), "app/api/admin/staff-operations/route.ts"), "utf8");
assert.match(route, /listVisibleStaffDirectory/);
assert.match(route, /rosterRequest/);

console.log("staff directory persistence tests passed");
