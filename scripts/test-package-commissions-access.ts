import assert from "node:assert/strict";
import {
  canManagePackageCommissions,
  canViewPackageCommissions
} from "../lib/admin/users";
import {
  accessFromLegacyRole,
  canAccessAdminTab
} from "../lib/admin/permissions";
import {
  confirmPackageCommissionRow,
  createPackageCommissionRow,
  filterPackageCommissionsForViewer,
  normalizePackageCommissionRow,
  type PackageCommissionRow
} from "../lib/staff/package-commissions";

assert.equal(canViewPackageCommissions("trainer"), true);
assert.equal(canViewPackageCommissions("assistant_manager"), true);
assert.equal(canViewPackageCommissions("manager_admin"), true);
assert.equal(canViewPackageCommissions("daycare"), false);

assert.equal(canManagePackageCommissions("assistant_manager"), true);
assert.equal(canManagePackageCommissions("manager_admin"), true);
assert.equal(canManagePackageCommissions("trainer"), false);

assert.equal(
  canAccessAdminTab(accessFromLegacyRole(null, null, "assistant_manager"), "package_commissions", "assistant_manager", "staff"),
  true
);

const sampleRow = (overrides: Partial<PackageCommissionRow> = {}): PackageCommissionRow =>
  normalizePackageCommissionRow({
    id: "pkg-1",
    dog_name: "Atlas",
    owner_name: "Victoria",
    trainer_user_id: "trainer-1",
    trainer_name: "Jamie Trainer",
    trainer_email: "jamie@fitdog.test",
    sale_category: "package",
    package_type: "6-Session Private",
    gingr_transaction_url: "",
    package_sale_amount: null,
    commission_amount: "$120",
    commission_percent: null,
    commission_mode: "amount",
    sold_at: "2026-07-01T12:00:00.000Z",
    status: "Pending",
    notes: null,
    created_by: "admin@fitdog.test",
    confirmed_at: null,
    confirmed_by: null,
    confirmed_by_user_id: null,
    comments: [],
    created_at: "2026-07-01T12:00:00.000Z",
    updated_at: "2026-07-01T12:00:00.000Z",
    ...overrides
  });

const rows = [
  sampleRow(),
  sampleRow({
    id: "pkg-2",
    trainer_user_id: "trainer-2",
    trainer_email: "other@fitdog.test",
    sale_category: "class",
    package_type: "Group Class 4-pack"
  })
];

const trainerRows = filterPackageCommissionsForViewer(rows, {
  role: "trainer",
  email: "jamie@fitdog.test",
  adminUserId: "trainer-1"
});
assert.equal(trainerRows.length, 1);
assert.equal(trainerRows[0]?.id, "pkg-1");

const adminRows = filterPackageCommissionsForViewer(rows, { role: "assistant_manager" });
assert.equal(adminRows.length, 2);

const legacyRow = normalizePackageCommissionRow({
  ...sampleRow({ id: "pkg-legacy" }),
  sale_category: undefined as unknown as PackageCommissionRow["sale_category"]
});
assert.equal(legacyRow.sale_category, "package");

const mockSupabase = {
  from() {
    return {
      select() {
        return {
          eq() {
            return {
              maybeSingle: async () => ({
                data: { settings: { package_commissions: { rows: [sampleRow()] } } }
              })
            };
          }
        };
      },
      upsert: async () => ({ error: null })
    };
  }
};

async function run() {
  const confirmed = await confirmPackageCommissionRow(
    mockSupabase as never,
    "pkg-1",
    { email: "manager@fitdog.test", adminUserId: "mgr-1", name: "Manager" }
  );
  assert.equal(confirmed.status, "Approved");
  assert.equal(confirmed.confirmed_by, "Manager");
  assert.equal(confirmed.confirmed_by_user_id, "mgr-1");
  assert.ok(confirmed.confirmed_at);

  const created = await createPackageCommissionRow(mockSupabase as never, {
    dog_name: "Brody",
    owner_name: "Johnson",
    trainer_name: "Jamie Trainer",
    trainer_email: "jamie@fitdog.test",
    sale_category: "class",
    package_type: "Group Class",
    commission_amount: "$80",
    sold_at: "2026-07-02"
  });
  assert.equal(created.sale_category, "class");
  assert.equal(created.status, "Pending");

  console.log("package commissions access tests passed");
}

void run();
