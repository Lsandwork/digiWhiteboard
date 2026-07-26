import assert from "node:assert/strict";
import { OPERATIONS_CHECKLIST_CATALOG } from "../lib/operations-checklist/catalog";
import { checklistRolesForStaffRole, canManageOperationsChecklist } from "../lib/operations-checklist/roles";
import { buildOperationsChecklistCsv, getOperationsShiftLabel } from "../lib/operations-checklist/server";
import {
  OPERATIONS_CHECKLIST_STATUSES,
  type OperationsChecklistInstance
} from "../lib/operations-checklist/types";
import { buildAdminNav, buildTrainerNav, getTabLabel } from "../lib/admin/nav-groups";
import { canAccessAdminTab } from "../lib/admin/permissions";
import type { AdminTab } from "../lib/admin/types";
import { ADMIN_TABS } from "../lib/admin/types";

assert.ok(ADMIN_TABS.includes("operations_checklist"), "tab registered");
assert.equal(getTabLabel("operations_checklist"), "Operations Checklist");

const keys = new Set(OPERATIONS_CHECKLIST_CATALOG.map((item) => item.catalog_key));
assert.equal(keys.size, OPERATIONS_CHECKLIST_CATALOG.length, "catalog keys must be unique");
assert.ok(OPERATIONS_CHECKLIST_CATALOG.length >= 140, `expected full catalog, got ${OPERATIONS_CHECKLIST_CATALOG.length}`);

assert.ok(checklistRolesForStaffRole("daycare").includes("handler"));
assert.ok(checklistRolesForStaffRole("front_desk_coordinator").includes("front_desk"));
assert.ok(checklistRolesForStaffRole("groomer").includes("groomer"));
assert.ok(checklistRolesForStaffRole("trainer").includes("trainer"));
assert.ok(checklistRolesForStaffRole("team_leader").includes("team_lead"));
assert.ok(canManageOperationsChecklist("manager_admin"));
assert.ok(canManageOperationsChecklist("team_leader"));
assert.equal(canManageOperationsChecklist("daycare"), false);

assert.ok(OPERATIONS_CHECKLIST_STATUSES.includes("needs_attention"));
assert.ok(getOperationsShiftLabel(new Date("2026-07-25T16:00:00.000Z")).length > 0);

assert.equal(canAccessAdminTab(null, "operations_checklist", "daycare", "staff"), true);
assert.equal(canAccessAdminTab(null, "operations_checklist", "groomer", "staff"), true);
assert.equal(canAccessAdminTab(null, "operations_checklist", "trainer", "lobby"), false);

const adminNav = buildAdminNav(["operations_checklist", "crossover_communication"] as AdminTab[], "staff");
assert.ok(
  adminNav.some(
    (entry) =>
      entry.type === "group" &&
      entry.children.some((child) => child.tab === "operations_checklist")
  ),
  "admin nav includes Operations Checklist"
);

const trainerNav = buildTrainerNav(["operations_checklist", "crossover_communication"] as AdminTab[]);
assert.ok(
  trainerNav.some(
    (entry) =>
      entry.type === "group" &&
      entry.children.some((child) => child.tab === "operations_checklist")
  ),
  "trainer nav includes Operations Checklist"
);

const sample: OperationsChecklistInstance = {
  id: "1",
  template_id: "t1",
  shift_date: "2026-07-25",
  catalog_key: "k",
  section_key: "morning_dog_care",
  section_label: "2. Morning Dog Care",
  section_sort: 2,
  title: "Complete morning potty walks",
  assigned_role: "handler",
  assigned_user_id: null,
  assigned_user_name: null,
  due_time: "08:30:00",
  sort_order: 1,
  status: "completed",
  notes: 'Said "done"',
  problem_note: null,
  help_requested: false,
  requires_photo: false,
  requires_management_approval: false,
  photo_url: null,
  completed_by_user_id: "u1",
  completed_by_name: "Alex",
  completed_at: "2026-07-25T15:30:00.000Z",
  started_by_user_id: null,
  started_by_name: null,
  started_at: null,
  returned_by_user_id: null,
  returned_by_name: null,
  returned_at: null,
  return_reason: null,
  pushed_to_staff_board: false,
  pushed_to_staff_board_at: null,
  acknowledgment_required: false,
  acknowledged_at: null,
  acknowledged_by_user_id: null,
  created_at: "2026-07-25T12:00:00.000Z",
  updated_at: "2026-07-25T15:30:00.000Z"
};

const csv = buildOperationsChecklistCsv([sample]);
assert.match(csv, /Complete morning potty walks/);
assert.match(csv, /Said ""done""/);

console.log("test-operations-checklist: ok");
