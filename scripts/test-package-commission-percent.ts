import assert from "node:assert/strict";
import {
  calculatePercentCommission,
  formatCommissionCurrency,
  parseCommissionAmount
} from "../lib/staff/package-commissions";

assert.equal(parseCommissionAmount("$1,200.50"), 1200.5);
assert.equal(calculatePercentCommission("$1000", "10"), 100);
assert.equal(calculatePercentCommission("850", "12.5"), 106.25);
assert.equal(formatCommissionCurrency(100), "$100.00");
assert.equal(calculatePercentCommission("", "10"), null);
assert.equal(calculatePercentCommission("1000", "-1"), null);

console.log("package commission percent calc: ok");
