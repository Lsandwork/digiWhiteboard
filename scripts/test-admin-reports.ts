import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { accessFromLegacyRole, canAccessAdminTab } from "../lib/admin/permissions";
import { ADMIN_TABS } from "../lib/admin/types";
import { getTabLabel } from "../lib/admin/nav-groups";
import { parentHubForTab } from "../lib/admin/super-admin-nav";
import {
  addDaysToDateKey,
  defaultReportRange,
  resolveReportRange,
  weekStartKey
} from "../lib/admin-reports/dates";
import { loginDayAndWeekRows, namedCounts } from "../lib/admin-reports/group";
import { parseReportKind } from "../lib/admin-reports/parse";

const root = process.cwd();

assert.equal((ADMIN_TABS as readonly string[]).includes("reports"), true);
assert.equal(getTabLabel("reports"), "Reports");
assert.equal(parentHubForTab("reports"), "sa_admin_hub");

assert.equal(parseReportKind("photos"), "photos");
assert.equal(parseReportKind("nope"), "overview");

assert.equal(weekStartKey("2026-08-18"), "2026-08-17"); // Tuesday → Monday
assert.equal(addDaysToDateKey("2026-08-18", 1), "2026-08-19");

{
  const range = defaultReportRange(new Date("2026-08-18T17:00:00.000Z"));
  assert.equal(range.to, "2026-08-18");
  assert.equal(range.from, "2026-08-12");
  const swapped = resolveReportRange("2026-08-20", "2026-08-10");
  assert.equal(swapped.from, "2026-08-10");
  assert.equal(swapped.to, "2026-08-20");
}

{
  const counts = namedCounts(new Map([["b", 1], ["a", 3]]));
  assert.equal(counts[0].key, "a");
  assert.equal(counts[0].count, 3);
}

{
  const grouped = loginDayAndWeekRows([
    { userKey: "u1", userLabel: "Alex", at: "2026-08-18T17:00:00.000Z" }, // Tue 10am PT
    { userKey: "u1", userLabel: "Alex", at: "2026-08-18T18:00:00.000Z" },
    { userKey: "u1", userLabel: "Alex", at: "2026-08-19T17:00:00.000Z" },
    { userKey: "u2", userLabel: "Sam", at: "2026-08-18T17:30:00.000Z" }
  ]);
  const alexTue = grouped.byDay.find((row) => row.userKey === "u1" && row.dateKey === "2026-08-18");
  assert.equal(alexTue?.count, 2);
  const alexWeek = grouped.byWeek.find((row) => row.userKey === "u1" && row.weekKey === "2026-08-17");
  assert.equal(alexWeek?.count, 3);
  const samWeek = grouped.byWeek.find((row) => row.userKey === "u2");
  assert.equal(samWeek?.count, 1);
}

for (const role of ["owner_admin", "manager_admin", "assistant_manager"] as const) {
  assert.equal(
    canAccessAdminTab(accessFromLegacyRole(`u-${role}`, `${role}@fitdog.test`, role), "reports", role, "staff"),
    true,
    `${role} can open Reports`
  );
}
for (const role of ["team_leader", "daycare", "groomer", "trainer", "front_desk_coordinator", "marketing"] as const) {
  assert.equal(
    canAccessAdminTab(accessFromLegacyRole(`u-${role}`, `${role}@fitdog.test`, role), "reports", role, "staff"),
    false,
    `${role} cannot open Reports`
  );
}

const dashboard = readFileSync(join(root, "components/admin/AdminDashboard.tsx"), "utf8");
assert.match(dashboard, /tab === "reports" \? <ReportsPanel/);
assert.match(dashboard, /Open Reports/);

const panel = readFileSync(join(root, "components/admin/ReportsPanel.tsx"), "utf8");
assert.match(panel, /Checklist completions/);
assert.match(panel, /Photo uploads/);
assert.match(panel, /Logins by day/);
assert.match(panel, /From/);

const login = readFileSync(join(root, "lib/admin/users.ts"), "utf8");
assert.match(login, /admin_login_events/);

const migration = readFileSync(join(root, "supabase/migrations/080_admin_login_events.sql"), "utf8");
assert.match(migration, /admin_login_events/);
assert.match(migration, /admin\.login/);

console.log("admin-reports tests passed");
