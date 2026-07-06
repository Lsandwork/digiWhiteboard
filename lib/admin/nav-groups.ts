import type { AdminBoardType, AdminTab } from "@/lib/admin/types";
import { ADMIN_HR_TABS, ADMIN_SUPPORT_TABS } from "@/lib/admin/types";

export type NavLeaf = {
  type: "item";
  tab: AdminTab;
  label: string;
};

export type NavGroup = {
  type: "group";
  id: string;
  label: string;
  children: NavLeaf[];
};

export type NavEntry = NavLeaf | NavGroup;

const TAB_LABELS: Record<AdminTab, string> = {
  overview: "Overview",
  content: "Content",
  promotions: "Promotions",
  schedule: "Class Schedule",
  display: "Display Settings",
  push_notices: "Push Notices",
  grooming_push: "Grooming Push",
  trainer_push: "Trainer Push",
  trainer_entry: "Trainer's Entry",
  crossover_communication: "Front Desk Log",
  owner_follow_up: "Owner Follow Up",
  active_issues: "Active Issues",
  whiteboard_preview: "Whiteboard Preview",
  yard_links: "Video Links",
  management_support: "Management Support",
  ms_hub: "Overview",
  ms_groomer_complaints: "Groomer Complaints",
  ms_groomer_requests: "Groomer Requests",
  ms_trainer_complaints: "Trainer Complaints",
  ms_trainer_requests: "Trainer Requests",
  admin_trainer_entries: "Trainer Entries",
  package_commissions: "Package Commissions",
  demo_push: "DEMO Push",
  analytics: "Analytics",
  templates: "Templates",
  notifications: "Notifications",
  staff_directory: "Staff Directory",
  users: "Users",
  settings: "Settings",
  logs: "Logs",
  integrations: "Integrations",
  help: "Help Center",
  hr_hub: "Records",
  hr_consult: "HR Consult"
};

const LOBBY_CONTENT_TABS: AdminTab[] = ["content", "promotions", "schedule", "display"];
const PUSH_ALERT_TABS: AdminTab[] = ["push_notices", "grooming_push", "trainer_push"];
const STAFF_OPS_TABS: AdminTab[] = ["crossover_communication", "owner_follow_up", "active_issues", "trainer_entry"];
const ADMIN_SYSTEM_TABS: AdminTab[] = ["users", "settings", "logs", "integrations"];

const SUPPORT_REVIEW_TABS: AdminTab[] = [...ADMIN_SUPPORT_TABS, "package_commissions"];

function leaf(tab: AdminTab, label?: string): NavLeaf {
  return { type: "item", tab, label: label ?? TAB_LABELS[tab] };
}

function group(id: string, label: string, tabs: AdminTab[], visible: Set<AdminTab>): NavGroup | null {
  const children = tabs.filter((tab) => visible.has(tab)).map((tab) => leaf(tab));
  if (!children.length) return null;
  return { type: "group", id, label, children };
}

function singles(tabs: AdminTab[], visible: Set<AdminTab>): NavLeaf[] {
  return tabs.filter((tab) => visible.has(tab)).map((tab) => leaf(tab));
}

/** Build a grouped sidebar nav from the tabs the user can access. */
export function buildAdminNav(visibleTabs: AdminTab[], board: AdminBoardType): NavEntry[] {
  const visible = new Set(visibleTabs);
  const entries: NavEntry[] = [];

  const lobbyContent = board === "lobby" ? group("lobby_content", "Board Content", LOBBY_CONTENT_TABS, visible) : null;
  if (lobbyContent) entries.push(lobbyContent);

  if (visible.has("overview")) entries.push(leaf("overview"));

  if (visible.has("demo_push")) entries.push(leaf("demo_push"));

  const pushAlerts = group("push_alerts", "Push & Alerts", PUSH_ALERT_TABS, visible);
  if (pushAlerts) entries.push(pushAlerts);

  const staffOps = group("staff_ops", "Staff Operations", STAFF_OPS_TABS, visible);
  if (staffOps) entries.push(staffOps);

  entries.push(...singles(["whiteboard_preview", "yard_links", "management_support"], visible));

  const supportReview = group("support_review", "Support Review", SUPPORT_REVIEW_TABS, visible);
  if (supportReview) entries.push(supportReview);

  const hrGroup = group("human_resources", "H.R.", [...ADMIN_HR_TABS], visible);
  if (hrGroup) entries.push(hrGroup);

  entries.push(...singles(["analytics", "templates", "notifications", "staff_directory"], visible));

  const adminSystem = group("admin_system", "Administration", ADMIN_SYSTEM_TABS, visible);
  if (adminSystem) entries.push(adminSystem);

  if (visible.has("help")) entries.push(leaf("help"));

  return flattenSingleChildGroups(entries);
}

function flattenSingleChildGroups(entries: NavEntry[]): NavEntry[] {
  return entries.flatMap((entry) => {
    if (entry.type === "group" && entry.children.length === 1) {
      return [entry.children[0]];
    }
    return [entry];
  });
}

export function getTabLabel(tab: AdminTab) {
  return TAB_LABELS[tab];
}

export function findNavGroupForTab(entries: NavEntry[], tab: AdminTab): string | null {
  for (const entry of entries) {
    if (entry.type === "group" && entry.children.some((child) => child.tab === tab)) {
      return entry.id;
    }
  }
  return null;
}

export function isTabInNav(entries: NavEntry[], tab: AdminTab) {
  for (const entry of entries) {
    if (entry.type === "item" && entry.tab === tab) return true;
    if (entry.type === "group" && entry.children.some((child) => child.tab === tab)) return true;
  }
  return false;
}
