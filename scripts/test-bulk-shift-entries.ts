import assert from "node:assert/strict";
import {
  compileShiftHandoff,
  emptyShiftHandoffItem,
  parseShiftHandoffItems
} from "../lib/ops-command-center/shift-handoff-items";
import {
  emptyBulkShiftLogRow,
  normalizeBulkShiftLogRow,
  normalizeBulkShiftLogRows,
  toCrossoverBulkPayload
} from "../lib/staff/bulk-shift-log";

const compiled = compileShiftHandoff([
  emptyShiftHandoffItem({ category: "medication", note: "Bella last dose 2pm" }),
  emptyShiftHandoffItem({ category: "latePickups", note: "Max owner 20 min late" }),
  emptyShiftHandoffItem({ category: "other", note: "  " })
]);

assert.equal(compiled.count, 2);
assert.equal(compiled.fields.medication, "Bella last dose 2pm");
assert.equal(compiled.fields.latePickups, "Max owner 20 min late");
assert.match(compiled.summary, /1\. \[Medication\] Bella last dose 2pm/);
assert.match(compiled.summary, /2\. \[Late pickup\] Max owner 20 min late/);

const parsed = parseShiftHandoffItems([
  { category: "feeding", note: "Skip breakfast for Ace" },
  { category: "not-a-real-category", note: "General leftover" }
]);
assert.equal(parsed.length, 2);
assert.equal(parsed[0].category, "feeding");
assert.equal(parsed[1].category, "other");

const emptyParsed = parseShiftHandoffItems([]);
assert.equal(emptyParsed.length, 1);
assert.equal(emptyParsed[0].note, "");

const row = emptyBulkShiftLogRow({ subject: "Yard note", details: "" });
const normalized = normalizeBulkShiftLogRow(row);
assert.equal(normalized?.subject, "Yard note");
assert.equal(normalized?.details, "Yard note");

const detailsOnly = normalizeBulkShiftLogRow(emptyBulkShiftLogRow({ details: "Keep Milo on a short leash today" }));
assert.equal(detailsOnly?.subject, "Keep Milo on a short leash today");
assert.equal(detailsOnly?.details, "Keep Milo on a short leash today");

assert.equal(normalizeBulkShiftLogRow(emptyBulkShiftLogRow()) , null);
assert.equal(normalizeBulkShiftLogRows([emptyBulkShiftLogRow(), row]).length, 1);

const payload = toCrossoverBulkPayload(
  [{ subject: "Yard note", details: "Keep Milo close", related_dog_name: "Milo" }],
  { log_type: "Daycare Note", priority: "Normal", assigned_to: "Front Desk", department_area: "Daycare" }
);
assert.equal(payload[0].subject, "Yard note");
assert.equal(payload[0].related_dog_name, "Milo");
assert.equal(payload[0].log_type, "Daycare Note");

console.log("test-bulk-shift-entries: ok");
