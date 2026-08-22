/**
 * TL board medications-focus layout when Additional Services are all clear.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  TL_MEDICATIONS_FOCUS_REMINDERS,
  shouldUseMedicationsFocusLayout
} from "../lib/tl-digi-board/medications-focus-layout";

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

assert.equal(
  shouldUseMedicationsFocusLayout({
    hasResolved: false,
    servicesHealth: "ok",
    servicesAllClear: true
  }),
  false,
  "do not flip layout before resolved"
);

assert.equal(
  shouldUseMedicationsFocusLayout({
    hasResolved: true,
    servicesHealth: "ok",
    servicesAllClear: true
  }),
  true
);

assert.equal(
  shouldUseMedicationsFocusLayout({
    hasResolved: true,
    servicesHealth: "ok",
    servicesAllClear: false
  }),
  false
);

assert.equal(
  shouldUseMedicationsFocusLayout({
    hasResolved: true,
    servicesHealth: "error",
    servicesAllClear: true
  }),
  false,
  "never hide services on false All Clear"
);

assert.equal(
  shouldUseMedicationsFocusLayout({
    hasResolved: true,
    servicesHealth: "stale",
    servicesAllClear: false
  }),
  false
);

assert.ok(TL_MEDICATIONS_FOCUS_REMINDERS.some((line) => /Gingr/i.test(line)));
assert.ok(TL_MEDICATIONS_FOCUS_REMINDERS.some((line) => /Owner Administered/i.test(line)));
assert.ok(TL_MEDICATIONS_FOCUS_REMINDERS.some((line) => /Front Desk Coordinator/i.test(line)));

{
  const board = source("components/boards/TlAlertsRemindersBoard.tsx");
  assert.match(board, /shouldUseMedicationsFocusLayout/);
  assert.match(board, /tl-board__split--meds-only/);
  assert.match(board, /tl-table__row--overdue-flash/);
  assert.match(board, /TL_MEDICATIONS_FOCUS_REMINDERS/);
  assert.match(board, /medicationsFocus/);

  const css = source("components/boards/tl-alerts-reminders-board.css");
  assert.match(css, /tl-board__split--meds-only/);
  assert.match(css, /tl-table__row--overdue-flash/);
  assert.match(css, /tl-overdue-row-flash/);
  assert.match(css, /prefers-reduced-motion/);
}

console.log("test-tl-medications-focus-layout: all assertions passed");
