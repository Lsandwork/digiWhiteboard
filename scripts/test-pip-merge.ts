import assert from "node:assert/strict";
import { mergePipPlansByEmployee, normalizePipEmployeeKey, type PipPlan } from "../lib/hr/pip";

function plan(partial: Partial<PipPlan> & Pick<PipPlan, "id" | "employee_name" | "focus_area">): PipPlan {
  const now = "2026-07-01T00:00:00.000Z";
  return {
    employee_role: null,
    manager_name: null,
    title: null,
    stage: "Stage 1",
    risk_level: "Medium",
    documentation_status: "Incomplete",
    goals: [],
    success_metrics: null,
    support_offered: null,
    employee_facing_summary: null,
    manager_notes: null,
    start_date: "2026-07-01",
    next_review_date: "2026-07-15",
    target_end_date: null,
    progress_percent: 0,
    status: "Active",
    notes: null,
    source_record_ids: [],
    check_ins: [],
    created_by: null,
    created_at: now,
    updated_at: now,
    ...partial
  };
}

assert.equal(normalizePipEmployeeKey("Anderson (Callum Dog owner)"), "anderson");
assert.equal(normalizePipEmployeeKey("Anderson"), "anderson");

const merged = mergePipPlansByEmployee([
  plan({
    id: "a",
    employee_name: "Anderson",
    focus_area: "uniform and headphones",
    created_at: "2026-07-01T00:00:00.000Z"
  }),
  plan({
    id: "b",
    employee_name: "Anderson (Callum Dog owner)",
    focus_area: "Growth plan: Not Engaged",
    created_at: "2026-07-10T00:00:00.000Z",
    goals: ["Stay engaged"]
  }),
  plan({
    id: "c",
    employee_name: "Anderson",
    focus_area: "Old closed plan",
    status: "Completed",
    created_at: "2025-01-01T00:00:00.000Z"
  })
]);

assert.equal(merged.length, 2, "one open plan + one completed");
const open = merged.find((row) => row.status === "Active");
assert.ok(open);
assert.equal(open!.employee_name, "Anderson");
assert.match(open!.focus_area, /uniform and headphones/);
assert.match(open!.focus_area, /Not Engaged/);
assert.deepEqual(open!.goals, ["Stay engaged"]);
assert.equal(merged.filter((row) => row.status === "Completed").length, 1);

console.log("pip merge tests passed");
