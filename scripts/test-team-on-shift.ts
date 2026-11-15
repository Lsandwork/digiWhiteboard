import assert from "node:assert/strict";
import { mergeTeamOnShiftCards } from "../lib/ops-command-center/team-on-shift";
import { pacificTodayKey, pacificDateKey } from "../lib/user-interactions/pacific";
import type { StaffDirectoryMember } from "../lib/staff/admin-ops";

const directory: StaffDirectoryMember[] = [
  {
    id: "dir-a",
    name: "Alex Handler",
    role: "Handler",
    department: "Daycare",
    email: "alex@fitdogclub.com",
    phone: null,
    status: "Active",
    notes: null,
    admin_user_id: "00000000-0000-4000-8000-000000000001",
    dashboard_role: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "dir-b",
    name: "Blair Ops",
    role: null,
    department: "Front Desk",
    email: "blair@fitdogclub.com",
    phone: null,
    status: "Active",
    notes: null,
    admin_user_id: "00000000-0000-4000-8000-000000000002",
    dashboard_role: "front_desk_coordinator",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z"
  }
];

const day = "2026-11-15";
const t1 = "2026-11-15T17:30:00.000Z";
const t2 = "2026-11-15T19:00:00.000Z";

const team = mergeTeamOnShiftCards({
  rows: [
    {
      admin_user_id: "00000000-0000-4000-8000-000000000001",
      business_date: day,
      first_login_at: t1,
      last_login_at: t2
    },
    {
      admin_user_id: "00000000-0000-4000-8000-000000000002",
      business_date: day,
      first_login_at: t2,
      last_login_at: t2
    },
    {
      admin_user_id: "00000000-0000-4000-8000-000000000099",
      business_date: day,
      first_login_at: t1,
      last_login_at: t1
    }
  ],
  adminUsers: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      full_name: "Alex Handler",
      email: "alex@fitdogclub.com",
      role: "daycare",
      status: "active",
      avatar_url: null
    },
    {
      id: "00000000-0000-4000-8000-000000000002",
      full_name: "Blair Ops",
      email: "blair@fitdogclub.com",
      role: "front_desk_coordinator",
      status: "active",
      avatar_url: "https://example.com/b.jpg"
    },
    {
      id: "00000000-0000-4000-8000-000000000099",
      full_name: "Demo Bot",
      email: "demo@demo.com",
      role: "daycare",
      status: "active",
      avatar_url: null
    }
  ],
  directory
});

assert.equal(team.length, 2, "excludes demo and unknown directory-only users");
assert.equal(team[0]?.name, "Alex Handler");
assert.equal(team[0]?.firstLoginAt, t1);
assert.equal(team[0]?.lastLoginAt, t2);
assert.equal(team[0]?.loggedInToday, true);
assert.equal(team[1]?.avatarUrl, "https://example.com/b.jpg");

const inactive = mergeTeamOnShiftCards({
  rows: [
    {
      admin_user_id: "00000000-0000-4000-8000-000000000001",
      business_date: day,
      first_login_at: t1,
      last_login_at: t2
    }
  ],
  adminUsers: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      full_name: "Alex Handler",
      email: "alex@fitdogclub.com",
      role: "daycare",
      status: "disabled",
      avatar_url: null
    }
  ],
  directory: [directory[0]!]
});
assert.equal(inactive.length, 0, "disabled accounts do not appear on Team on Shift");

// Pacific date: late evening UTC still same LA day; after midnight LA rolls forward.
assert.equal(pacificDateKey("2026-03-08T07:59:59.000Z"), "2026-03-07");
assert.equal(pacificDateKey("2026-03-08T10:00:00.000Z"), "2026-03-08");
assert.equal(pacificTodayKey(new Date("2026-11-15T12:00:00.000Z")), "2026-11-15");

console.log("test-team-on-shift: ok");