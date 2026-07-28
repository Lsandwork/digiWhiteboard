import assert from "node:assert/strict";
import {
  accessFromLegacyRole,
  canAccessAdminTab,
  hasPermission
} from "@/lib/admin/permissions";
import { buildAdminNav, findNavSectionForTab } from "@/lib/admin/nav-groups";
import { PACK_PRO_REQUIRED_COURSES } from "@/lib/pack-pro/courses";
import { canManagePackProTraining, canViewPackProTraining } from "@/lib/pack-pro/access";
import { buildPackProSummary } from "@/lib/pack-pro/store";
import type { PackProLearnerRow } from "@/lib/pack-pro/types";

assert.equal(PACK_PRO_REQUIRED_COURSES.length, 6);
assert.ok(PACK_PRO_REQUIRED_COURSES.some((course) => course.title === "Group Management"));
assert.ok(PACK_PRO_REQUIRED_COURSES.some((course) => course.title.includes("Leadership")));
assert.ok(PACK_PRO_REQUIRED_COURSES.some((course) => course.title.includes("Canine Health")));
assert.ok(PACK_PRO_REQUIRED_COURSES.some((course) => course.title === "New Dog Evaluation"));
assert.ok(PACK_PRO_REQUIRED_COURSES.some((course) => course.title === "Dog Body Language"));
assert.ok(PACK_PRO_REQUIRED_COURSES.some((course) => course.title === "Customer Service Basics"));

const admin = accessFromLegacyRole("a1", "admin@fitdog.test", "manager_admin");
const management = accessFromLegacyRole("m1", "mgr@fitdog.test", "assistant_manager");
const lead = accessFromLegacyRole("l1", "lead@fitdog.test", "team_leader");
const fdc = accessFromLegacyRole("f1", "fdc@fitdog.test", "front_desk_coordinator");

assert.equal(canAccessAdminTab(admin, "pack_pro_training", "manager_admin", "staff"), true);
assert.equal(canAccessAdminTab(management, "pack_pro_training", "assistant_manager", "staff"), true);
assert.equal(canAccessAdminTab(lead, "pack_pro_training", "team_leader", "staff"), false);
assert.equal(canAccessAdminTab(fdc, "pack_pro_training", "front_desk_coordinator", "staff"), false);

assert.equal(canViewPackProTraining(management, "assistant_manager"), true);
assert.equal(canManagePackProTraining(management, "assistant_manager"), true);
assert.equal(hasPermission(management, "view_pack_pro_training"), true);

const nav = buildAdminNav(
  ["ms_hub", "management_support", "admin_trainer_entries", "pack_pro_training", "settings"],
  "staff"
);
assert.equal(findNavSectionForTab(nav, "pack_pro_training"), "Management");
assert.match(JSON.stringify(nav), /Pack Pro Training/);

const learners: PackProLearnerRow[] = [
  {
    id: "1",
    name: "Alex",
    email: "alex@fitdog.com",
    admin_user_id: null,
    courses: PACK_PRO_REQUIRED_COURSES.map((course, index) => ({
      course_id: course.id,
      course_slug: course.slug,
      course_title: course.title,
      percent: index < 3 ? 100 : 0,
      status: index < 3 ? "completed" : "not_started"
    })),
    completed_count: 3,
    required_count: 6,
    overall_percent: 50,
    is_complete: false,
    incomplete_courses: PACK_PRO_REQUIRED_COURSES.slice(3).map((course) => course.title),
    last_synced_at: "2026-07-28T00:00:00.000Z"
  },
  {
    id: "2",
    name: "Blake",
    email: "blake@fitdog.com",
    admin_user_id: null,
    courses: PACK_PRO_REQUIRED_COURSES.map((course) => ({
      course_id: course.id,
      course_slug: course.slug,
      course_title: course.title,
      percent: 100,
      status: "completed"
    })),
    completed_count: 6,
    required_count: 6,
    overall_percent: 100,
    is_complete: true,
    incomplete_courses: [],
    last_synced_at: "2026-07-28T00:00:00.000Z"
  }
];

const summary = buildPackProSummary(learners, "2026-07-28T00:00:00.000Z");
assert.equal(summary.learner_count, 2);
assert.equal(summary.complete_count, 1);
assert.equal(summary.incomplete_count, 1);
assert.equal(summary.average_percent, 75);

console.log("pack pro training tests passed");
