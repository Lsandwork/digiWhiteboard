import assert from "node:assert/strict";
import {
  buildVipRebookSms,
  isVipRebookAlertDue
} from "../lib/staff/vip-auto-book/rebook-alerts";

const now = new Date("2026-08-21T12:00:00.000Z");

assert.equal(
  isVipRebookAlertDue(
    {
      needToRebook: true,
      needToRebookSetAt: "2026-08-07T12:00:00.000Z",
      rebookAlertSentAt: null
    },
    now
  ),
  true,
  "14 days Yes should be due"
);

assert.equal(
  isVipRebookAlertDue(
    {
      needToRebook: true,
      needToRebookSetAt: "2026-08-10T12:00:00.000Z",
      rebookAlertSentAt: null
    },
    now
  ),
  false,
  "under 14 days should not be due"
);

assert.equal(
  isVipRebookAlertDue(
    {
      needToRebook: true,
      needToRebookSetAt: "2026-08-01T12:00:00.000Z",
      rebookAlertSentAt: "2026-08-15T12:00:00.000Z"
    },
    now
  ),
  false,
  "already sent should not re-fire"
);

assert.equal(
  buildVipRebookSms({
    id: "x",
    dogName: "Gracie",
    ownerName: "Nina Saxon"
  } as never).includes("Gracie"),
  true
);

assert.equal(
  buildVipRebookSms({
    id: "x",
    dogName: "Gracie",
    ownerName: "Nina Saxon"
  } as never).includes("RuffOps"),
  true
);

console.log("vip rebook alert timing checks passed");
