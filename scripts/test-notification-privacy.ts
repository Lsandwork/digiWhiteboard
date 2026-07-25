import assert from "node:assert/strict";
import {
  filterPersonalNotificationsForUser,
  notificationsForSession,
  sessionCanAccessNotification,
  usesPersonalNotificationsOnly,
  type StaffNotification
} from "../lib/staff/notifications";
import type { StaffOpsState } from "../lib/staff/admin-ops";

function makeState(notifications: StaffNotification[]): StaffOpsState {
  return {
    crossover_messages: [],
    crossover_message_replies: [],
    owner_follow_ups: [],
    active_issues: [],
    activity_logs: [],
    staff_directory: [
      {
        id: "m1",
        name: "Alex Trainer",
        role: "Trainer",
        department: "Training",
        email: "alex@fitdog.com",
        phone: null,
        notes: null,
        status: "Active",
        admin_user_id: "admin-alex",
        dashboard_role: "trainer",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: "m2",
        name: "Sam Desk",
        role: "Front Desk",
        department: "Front Desk",
        email: "sam@fitdog.com",
        phone: null,
        notes: null,
        status: "Active",
        admin_user_id: "admin-sam",
        dashboard_role: "front_desk_coordinator",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ],
    notifications
  };
}

function notif(partial: Partial<StaffNotification> & Pick<StaffNotification, "id" | "target">): StaffNotification {
  return {
    type: "update",
    title: partial.title ?? partial.id,
    body: null,
    priority: "Normal",
    source_table: "test",
    source_id: partial.id,
    source_tab: "notifications",
    read_by: [],
    created_by: "system",
    created_at: new Date().toISOString(),
    ...partial
  };
}

const state = makeState([
  notif({ id: "for-alex", target: { kind: "staff_email", email: "alex@fitdog.com" }, title: "Alex only" }),
  notif({ id: "for-sam-name", target: { kind: "staff_name", name: "Sam Desk" }, title: "Sam only" }),
  notif({ id: "coord-pool", target: { kind: "coordinator_pool" }, title: "Coordinator pool" }),
  notif({ id: "admin-pool", target: { kind: "admin_pool" }, title: "Admin pool" }),
  notif({ id: "grooming-dept", target: { kind: "department_pool", department: "Grooming" }, title: "Grooming dept" }),
  notif({ id: "front-desk-dept", target: { kind: "department_pool", department: "Front Desk" }, title: "Front Desk dept" })
]);

assert.equal(usesPersonalNotificationsOnly("trainer"), true);
assert.equal(usesPersonalNotificationsOnly("front_desk_coordinator"), true);
assert.equal(usesPersonalNotificationsOnly("groomer"), true);
assert.equal(usesPersonalNotificationsOnly("daycare"), true);
assert.equal(usesPersonalNotificationsOnly("owner_admin"), false);
assert.equal(usesPersonalNotificationsOnly("assistant_manager"), false);
assert.equal(usesPersonalNotificationsOnly(null), true, "missing role must not get admin inbox");

const alex = notificationsForSession(state, {
  email: "alex@fitdog.com",
  adminUserId: "admin-alex",
  role: "trainer"
});
assert.deepEqual(
  alex.map((n) => n.id),
  ["for-alex"],
  "trainer must only see personally addressed alerts"
);

const sam = notificationsForSession(state, {
  email: "sam@fitdog.com",
  adminUserId: "admin-sam",
  role: "front_desk_coordinator"
});
assert.deepEqual(
  sam.map((n) => n.id),
  ["for-sam-name"],
  "front desk coordinator must not see coordinator_pool / other depts in personal inbox"
);

const admin = notificationsForSession(state, {
  email: "owner@fitdog.com",
  adminUserId: "admin-owner",
  role: "owner_admin"
});
assert.ok(admin.some((n) => n.id === "admin-pool"));
assert.ok(admin.some((n) => n.id === "grooming-dept"));
assert.equal(
  admin.some((n) => n.id === "coord-pool"),
  false,
  "owner admin uses admin_pool, not coordinator_pool"
);
assert.equal(
  sessionCanAccessNotification(state, "coord-pool", {
    email: "alex@fitdog.com",
    adminUserId: "admin-alex",
    role: "trainer"
  }),
  false
);
assert.equal(
  sessionCanAccessNotification(state, "for-alex", {
    email: "alex@fitdog.com",
    adminUserId: "admin-alex",
    role: "trainer"
  }),
  true
);

const personalSam = filterPersonalNotificationsForUser(state, {
  email: "sam@fitdog.com",
  adminUserId: "admin-sam",
  role: "front_desk_coordinator"
});
assert.equal(personalSam.some((n) => n.id === "coord-pool"), false);
assert.equal(personalSam.some((n) => n.id === "front-desk-dept"), false);

console.log("notification privacy tests passed");
