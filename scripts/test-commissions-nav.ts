import assert from "node:assert/strict";
import { buildAdminNav, buildGroomerNav, buildTeamLeadNav, buildTrainerNav, findNavGroupForTab, findNavSectionForTab } from "../lib/admin/nav-groups";
import type { AdminTab } from "../lib/admin/types";

const trainerTabs: AdminTab[] = [
  "trainer_push",
  "trainer_entry",
  "package_commissions",
  "management_support",
  "notifications",
  "yard_links",
  "walks_board",
  "settings",
  "help"
];

const adminTabs: AdminTab[] = [
  "overview",
  "package_commissions",
  "ms_hub",
  "ms_groomer_complaints",
  "ms_trainer_complaints",
  "ms_groomer_requests",
  "ms_trainer_requests",
  "admin_trainer_entries",
  "help"
];

const trainerNav = buildTrainerNav(trainerTabs);
const adminNav = buildAdminNav(adminTabs, "staff");

const teamLeadTabs: AdminTab[] = [
  "push_notices",
  "yard_push_notices",
  "grooming_push",
  "crossover_communication",
  "management_support",
  "notifications",
  "yard_links",
  "walks_board",
  "settings",
  "help"
];
const teamLeadNav = buildTeamLeadNav(teamLeadTabs);

assert.equal(findNavSectionForTab(teamLeadNav, "management_support"), "Management Support");
assert.equal(
  findNavSectionForTab(adminNav, "management_support"),
  null,
  "admin nav without management_support tab should not resolve a section"
);

const teamLeadFrontDeskSection = teamLeadNav.find((entry) => entry.type === "section" && entry.label === "Front Desk & Floor");
assert.ok(teamLeadFrontDeskSection);
const teamLeadFrontDeskHasSubmit = teamLeadNav.some(
  (entry) =>
    entry.type === "group" &&
    entry.id === "front_desk" &&
    entry.children.some((child) => child.tab === "management_support")
);
assert.equal(teamLeadFrontDeskHasSubmit, false, "management_support should not live under Front Desk & Floor for team leads");

const groomerTabs: AdminTab[] = [
  "grooming_push",
  "crossover_communication",
  "whiteboard_preview",
  "management_support",
  "notifications",
  "yard_links",
  "walks_board",
  "settings",
  "help"
];
const groomerNav = buildGroomerNav(groomerTabs);
assert.equal(findNavSectionForTab(groomerNav, "management_support"), "Management Support");
assert.equal(findNavSectionForTab(groomerNav, "grooming_push"), "Push to Whiteboard");
const groomerAdminSection = groomerNav.find((entry) => entry.type === "section" && entry.label === "Management Review");
assert.equal(groomerAdminSection, undefined, "groomer nav should not include empty Management Review section");

assert.equal(findNavSectionForTab(trainerNav, "package_commissions"), "Commissions");
assert.equal(findNavGroupForTab(trainerNav, "package_commissions"), "commissions");
assert.equal(findNavSectionForTab(adminNav, "package_commissions"), "Commissions");
assert.equal(findNavGroupForTab(adminNav, "package_commissions"), "commissions");

const trainerCommissionsSection = trainerNav.find((entry) => entry.type === "section" && entry.label === "Commissions");
assert.ok(trainerCommissionsSection);

const trainerCommissionsGroup = trainerNav.find(
  (entry) => entry.type === "group" && entry.id === "commissions"
);
assert.ok(trainerCommissionsGroup && trainerCommissionsGroup.type === "group");
assert.equal(trainerCommissionsGroup.children.length, 1);
assert.equal(trainerCommissionsGroup.children[0]?.label, "Package & Class Commissions");

const supportComplaints = adminNav.find((entry) => entry.type === "group" && entry.id === "support_complaints");
const supportRequests = adminNav.find((entry) => entry.type === "group" && entry.id === "support_requests");
assert.ok(supportComplaints && supportComplaints.type === "group", "Complaints group should exist under Support Inbox");
assert.ok(supportRequests && supportRequests.type === "group", "Requests group should exist under Support Inbox");
assert.equal(
  supportComplaints.children.some((child) => child.tab === "package_commissions"),
  false,
  "package_commissions should not live under Complaints"
);
assert.equal(
  supportRequests.children.some((child) => child.tab === "package_commissions"),
  false,
  "package_commissions should not live under Requests"
);
assert.deepEqual(
  supportComplaints.children.map((child) => child.tab),
  ["ms_groomer_complaints", "ms_trainer_complaints"]
);
assert.deepEqual(
  supportRequests.children.map((child) => child.tab),
  ["ms_trainer_requests", "ms_groomer_requests"]
);

console.log("commissions nav tests passed");
