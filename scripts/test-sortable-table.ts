import assert from "node:assert/strict";
import { compareSortValues, sortRowsByKey } from "@/components/admin/ui/sortable-table";

assert.equal(compareSortValues("b", "a") > 0, true);
assert.equal(compareSortValues(2, 10) < 0, true);
assert.equal(compareSortValues(null, "x") > 0, true);
assert.equal(compareSortValues("2026-07-20", "2026-07-18") > 0, true);

const rows = [
  { id: "1", name: "Charlie", amount: 30 },
  { id: "2", name: "Ada", amount: 10 },
  { id: "3", name: "Bea", amount: 20 }
];
const accessors = {
  name: (row: (typeof rows)[number]) => row.name,
  amount: (row: (typeof rows)[number]) => row.amount
};

assert.deepEqual(
  sortRowsByKey(rows, "name", "asc", accessors).map((row) => row.name),
  ["Ada", "Bea", "Charlie"]
);
assert.deepEqual(
  sortRowsByKey(rows, "amount", "desc", accessors).map((row) => row.amount),
  [30, 20, 10]
);

console.log("sortable table tests passed");
