import assert from "node:assert/strict";
import { buildAdminNav, buildTrainerNav, findNavGroupForTab, findNavSectionForTab } from "../lib/admin/nav-groups";
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
  "help"
];

const trainerNav = buildTrainerNav(trainerTabs);
const adminNav = buildAdminNav(adminTabs, "staff");

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

const supportInbox = adminNav.find((entry) => entry.type === "group" && entry.id === "support_inbox");
if (supportInbox && supportInbox.type === "group") {
  assert.equal(
    supportInbox.children.some((child) => child.tab === "package_commissions"),
    false,
    "package_commissions should not live under Support Inbox"
  );
}

console.log("commissions nav tests passed");
