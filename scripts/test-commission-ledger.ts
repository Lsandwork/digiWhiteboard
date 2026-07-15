/**
 * Commission ledger unit tests (money, auth, rules, CSV sanitize).
 * Run: npx tsx scripts/test-commission-ledger.ts
 */
import assert from "node:assert/strict";
import {
  assertCanManage,
  assertNotManagementDestructive,
  assertSuperAdmin,
  calculatePercentCommissionCents,
  centsToDisplay,
  parseMoneyToCents,
  parsePercentToBps,
  previewCommissionRule,
  sanitizeCsvCell,
  trainerOwnsRecord,
  parseCommissionDate,
  type CommissionViewer
} from "../lib/staff/commission-ledger";

// Money (integer cents)
assert.equal(parseMoneyToCents("$1,200.50"), 120050);
assert.equal(parseMoneyToCents("27.50"), 2750);
assert.equal(parseMoneyToCents(0), 0);
assert.equal(centsToDisplay(2750), "$27.50");
assert.equal(centsToDisplay(-5000), "-$50.00");
assert.equal(parsePercentToBps("50"), 5000);
assert.equal(parsePercentToBps("12.5"), 1250);
assert.equal(calculatePercentCommissionCents(10_000, 5000), 5000); // $100 @ 50% = $50
assert.equal(calculatePercentCommissionCents(4583, 5000), 2292); // rounds

// Rule preview
assert.equal(
  previewCommissionRule({
    calculation_type: "percentage_of_gross",
    gross_amount: "100",
    rate: "50"
  }),
  5000
);
assert.equal(
  previewCommissionRule({
    calculation_type: "percentage_after_discount",
    gross_amount: "100",
    discount_amount: "20",
    rate: "50"
  }),
  4000
);
assert.equal(
  previewCommissionRule({
    calculation_type: "fixed_per_session",
    gross_amount: "0",
    fixed_amount: "35"
  }),
  3500
);
assert.equal(
  previewCommissionRule({
    calculation_type: "fixed_per_attendee",
    gross_amount: "0",
    fixed_amount: "10",
    quantity: 3
  }),
  3000
);
assert.equal(
  previewCommissionRule({
    calculation_type: "refund_reversal",
    gross_amount: "0",
    fixed_amount: "50"
  }),
  -5000
);

// CSV formula injection
assert.equal(sanitizeCsvCell("=CMD()"), "'=CMD()");
assert.equal(sanitizeCsvCell("+1-555"), "'+1-555");
assert.equal(sanitizeCsvCell("Normal"), "Normal");

// Auth
const trainerViewer: CommissionViewer = {
  canManage: false,
  canComment: true,
  isTrainerOnly: true,
  isSuperAdmin: false,
  adminUserId: "t1",
  email: "jamie@fitdog.test",
  role: "trainer",
  roleKey: "trainer"
};

assert.throws(() => assertCanManage(trainerViewer), /permission/);
assert.throws(
  () =>
    assertNotManagementDestructive(
      { ...trainerViewer, canManage: true, isTrainerOnly: false, roleKey: "management", role: "assistant_manager" },
      "reopen_payroll"
    ),
  /Management cannot/
);
assert.throws(() => assertSuperAdmin(trainerViewer), /Super Admin/);

assert.equal(
  trainerOwnsRecord({ trainer_user_id: "t1", trainer_email: "jamie@fitdog.test" }, trainerViewer),
  true
);
assert.equal(
  trainerOwnsRecord({ trainer_user_id: "t2", trainer_email: "other@fitdog.test" }, trainerViewer),
  false
);

// Partial / full refund arithmetic (ledger amounts)
const original = 5000;
const partialRefund = 2000;
assert.equal(original - partialRefund, 3000);
const fullRefund = 5000;
assert.equal(original - fullRefund, 0);

assert.equal(parseCommissionDate("07142026"), "2026-07-14");
assert.equal(parseCommissionDate("07/14/2026"), "2026-07-14");
assert.equal(parseCommissionDate("2026-07-02"), "2026-07-02");

console.log("commission ledger: ok");
