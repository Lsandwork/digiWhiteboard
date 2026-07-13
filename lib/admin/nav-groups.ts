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

export type NavSection = {
  type: "section";
  id: string;
  label: string;
};

export type NavEntry = NavLeaf | NavGroup | NavSection;

const TAB_LABELS: Record<AdminTab, string> = {
  checklist: "Check List",
  overview: "Overview",
  content: "Board Messages",
  promotions: "Promotions",
  schedule: "Class Schedule",
  lobby_slideshow: "Slideshow Upload",
  display: "TV & Cast Setup",
  push_notices: "Standard Notices",
  yard_push_notices: "Yard Camera Push",
  emergency_alerts: "Emergency Alerts",
  grooming_push: "Grooming Push",
  trainer_push: "Trainer Push",
  cast_videos: "Cast Videos",
  trainer_entry: "Trainer's Entry",
  crossover_communication: "Front Desk Log",
  owner_follow_up: "Owner Follow Up",
  active_issues: "Active Issues",
  whiteboard_preview: "Live Preview",
  yard_links: "Video Links",
  management_support: "Submit Request",
  ms_hub: "Support Dashboard",
  ms_groomer_complaints: "Groomer Complaints",
  ms_groomer_requests: "Groomer Requests",
  ms_trainer_complaints: "Trainer Complaints",
  ms_trainer_requests: "Trainer Requests",
  admin_trainer_entries: "Trainer Entries",
  package_commissions: "Package & Class Commissions",
  demo_push: "Demo Push",
  analytics: "Analytics",
  templates: "Message Templates",
  notifications: "Notifications",
  staff_directory: "Staff Directory",
  staff_create_user: "Create User",
  users: "User Accounts",
  settings: "Global Settings",
  logs: "Activity Logs",
  integrations: "Integrations",
  help: "Help Center",
  hr_hub: "HR Records",
  hr_consult: "HR Consult",
  bulk_photo_upload: "Bulk Photo Upload",
  write_ups: "Write Ups",
  handler_shift_entry: "Handler Shift Entry Log",
  hr_pip: "P.I.P",
  remote_cast: "Remote Whiteboard Cast",
  walks_board: "Walks Board"
};

const TAB_DESCRIPTIONS: Partial<Record<AdminTab, string>> = {
  checklist: "Personal handler checklist for daily shift tasks.",
  overview: "Sync health, checkout counts, and quick board settings.",
  content: "Edit the messages guests and staff see on the whiteboard.",
  promotions: "Manage lobby promotion cards shown during idle time.",
  schedule: "Edit the weekly class schedule on the lobby display.",
  lobby_slideshow: "Upload photos and videos that are added to the lobby idle slideshow.",
  display: "Cast display URLs, TV setup checklist, and board refresh settings.",
  push_notices: "Send live reminders and alerts to the staff whiteboard.",
  yard_push_notices: "Push yard camera feeds to the staff whiteboard.",
  emergency_alerts: "Full-screen urgent alerts for the staff whiteboard.",
  grooming_push: "Alert handlers when a dog needs grooming.",
  trainer_push: "Alert handlers when a dog needs training.",
  cast_videos: "Upload and push full-screen videos to displays.",
  trainer_entry: "Log trainer check-ins and session notes.",
  package_commissions: "Track package and class sales, confirm commissions, and review trainer earnings.",
  crossover_communication: "Front desk handoff log between shifts.",
  owner_follow_up: "Track owner follow-ups and callbacks.",
  active_issues: "Monitor open floor issues and escalations.",
  whiteboard_preview: "Preview what is live on the whiteboard right now.",
  yard_links: "Manage yard camera and video links.",
  management_support: "Submit complaints, requests, and write-ups.",
  ms_hub: "Review management support submissions.",
  templates: "Reusable message templates for staff communications.",
  notifications: "Internal staff notifications and replies.",
  walks_board: "Track recurring walks for No Plays, Groomed Dogs, and Break Dogs.",
  staff_directory: "Edit staff names, roles, and contact info.",
  staff_create_user: "Create a new staff admin login.",
  users: "Manage admin users, roles, and permissions.",
  settings: "Global admin and whiteboard behavior settings.",
  logs: "Audit trail of admin actions and system events.",
  integrations: "Gingr sync, webhooks, and connection status.",
  help: "Setup guides and how-to articles.",
  analytics: "Operational metrics and board activity summary.",
  demo_push: "Try push notices in demo mode.",
  bulk_photo_upload: "Upload and verify dog photos in batches.",
  write_ups: "Submit and review your own write-up forms.",
  handler_shift_entry: "Create handler shift log entries sent to Front Desk Log.",
  hr_pip: "View your performance improvement plan records.",
  remote_cast: "Control lobby and staff whiteboards on building displays from anywhere."
};

const LOBBY_BOARD_TABS: AdminTab[] = ["content", "promotions", "schedule", "lobby_slideshow", "display", "whiteboard_preview"];
const PUSH_TO_BOARD_TABS: AdminTab[] = [
  "push_notices",
  "grooming_push",
  "trainer_push",
  "yard_push_notices",
  "cast_videos",
  "emergency_alerts"
];
const FRONT_DESK_TABS: AdminTab[] = [
  "crossover_communication",
  "owner_follow_up",
  "active_issues",
  "trainer_entry",
  "walks_board"
];
const MEDIA_TABS: AdminTab[] = ["yard_links"];
const COMMISSIONS_TABS: AdminTab[] = ["package_commissions"];
const SUPPORT_INBOX_TABS: AdminTab[] = [...ADMIN_SUPPORT_TABS];
const COMMS_TABS: AdminTab[] = ["templates", "notifications"];
const ADMIN_SYSTEM_TABS: AdminTab[] = ["users", "settings", "logs", "integrations"];

function compactEntries(items: Array<NavEntry | null | undefined | false>): NavEntry[] {
  return items.filter((item): item is NavEntry => Boolean(item));
}

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

function section(id: string, label: string): NavSection {
  return { type: "section", id, label };
}

function sectionEntries(sectionId: string, sectionLabel: string, items: NavEntry[], preserveGroups = false): NavEntry[] {
  const content = preserveGroups ? compactEntries(items) : flattenSingleChildGroups(compactEntries(items));
  if (!content.length) return [];
  return [section(sectionId, sectionLabel), ...content];
}

function flattenSingleChildGroups(entries: NavEntry[]): NavEntry[] {
  return entries.flatMap((entry) => {
    if (entry.type === "group" && entry.children.length === 1) {
      return [entry.children[0]];
    }
    return [entry];
  });
}

/** Build a grouped sidebar nav from the tabs the user can access. */
export function buildAdminNav(visibleTabs: AdminTab[], board: AdminBoardType): NavEntry[] {
  const visible = new Set(visibleTabs);
  const entries: NavEntry[] = [];

  if (board === "lobby") {
    entries.push(
      ...sectionEntries(
        "lobby_board",
        "Lobby Whiteboard",
        compactEntries([
          ...singles(["overview"], visible),
          group(
            "lobby_content",
            "Board Content",
            LOBBY_BOARD_TABS.filter((tab) => tab !== "display" && tab !== "whiteboard_preview"),
            visible
          ),
          group("lobby_display", "Display & Cast", ["display", "whiteboard_preview", "remote_cast"], visible)
        ])
      )
    );

    entries.push(
      ...sectionEntries(
        "lobby_insights",
        "Insights & System",
        compactEntries([
          ...singles(["analytics", "logs"], visible),
          group("admin_system", "Administration", ADMIN_SYSTEM_TABS, visible)
        ])
      )
    );
  } else {
    entries.push(
      ...sectionEntries(
        "staff_dashboard",
        "Dashboard",
        singles(["demo_push", "overview", "whiteboard_preview", "display", "remote_cast", "content", "analytics", "checklist"], visible)
      )
    );

    entries.push(
      ...sectionEntries(
        "staff_push",
        "Push to Whiteboard",
        compactEntries([group("push_to_board", "Live Alerts", PUSH_TO_BOARD_TABS, visible)])
      )
    );

    entries.push(
      ...sectionEntries(
        "staff_operations",
        "Front Desk & Floor",
        compactEntries([
          group("front_desk", "Operations", FRONT_DESK_TABS, visible),
          ...singles(MEDIA_TABS, visible),
          ...singles(["management_support", "handler_shift_entry", "bulk_photo_upload"], visible)
        ])
      )
    );

    entries.push(
      ...sectionEntries(
        "staff_management",
        "Management Review",
        compactEntries([group("support_inbox", "Support Inbox", SUPPORT_INBOX_TABS, visible)])
      )
    );

    entries.push(
      ...sectionEntries(
        "staff_commissions",
        "Commissions",
        compactEntries([group("commissions", "Commissions", COMMISSIONS_TABS, visible)]),
        true
      )
    );

    entries.push(
      ...sectionEntries(
        "staff_people",
        "People & HR",
        compactEntries([
          group("people_directory", "Staff", ["staff_directory", "staff_create_user"], visible),
          group("human_resources", "Human Resources", [...ADMIN_HR_TABS, "hr_pip"], visible)
        ])
      )
    );

    entries.push(...sectionEntries("staff_comms", "Communications", singles(COMMS_TABS, visible)));

    entries.push(
      ...sectionEntries(
        "staff_admin",
        "Administration",
        compactEntries([group("admin_system", "System", ADMIN_SYSTEM_TABS, visible)])
      )
    );
  }

  if (visible.has("help")) {
    entries.push(section("help", "Support"));
    entries.push(leaf("help"));
  }

  return entries;
}

/** Trainer panel nav — grouped for training workflows instead of admin review sections. */
export function buildTrainerNav(visibleTabs: AdminTab[]): NavEntry[] {
  const visible = new Set(visibleTabs);
  const entries: NavEntry[] = [];

  entries.push(
    ...sectionEntries(
      "trainer_push",
      "Push to Whiteboard",
      compactEntries([group("trainer_live_alerts", "Live Alerts", ["trainer_push"], visible)])
    )
  );

  entries.push(
    ...sectionEntries(
      "trainer_training",
      "Training",
      compactEntries([...singles(["trainer_entry"], visible)])
    )
  );

  entries.push(
    ...sectionEntries(
      "trainer_commissions",
      "Commissions",
      compactEntries([group("commissions", "Commissions", COMMISSIONS_TABS, visible)]),
      true
    )
  );

  entries.push(
    ...sectionEntries(
      "trainer_support",
      "Support",
      compactEntries([...singles(["management_support"], visible)])
    )
  );

  entries.push(
    ...sectionEntries(
      "trainer_comms",
      "Communications",
      compactEntries([...singles(["notifications", "yard_links", "walks_board"], visible)])
    )
  );

  entries.push(
    ...sectionEntries(
      "trainer_admin",
      "Settings",
      compactEntries([...singles(["settings"], visible)])
    )
  );

  if (visible.has("help")) {
    entries.push(section("help", "Support"));
    entries.push(leaf("help"));
  }

  return entries;
}

export function getTabLabel(tab: AdminTab) {
  return TAB_LABELS[tab];
}

export function getTabDescription(tab: AdminTab, board: AdminBoardType) {
  if (tab === "display") {
    return board === "lobby"
      ? "Cast display URLs, TV setup, and lobby board refresh settings."
      : "Cast display URLs, TV setup, and staff board refresh settings.";
  }
  return TAB_DESCRIPTIONS[tab] ?? "Manage this area of the Fitdog admin center.";
}

export function findNavGroupForTab(entries: NavEntry[], tab: AdminTab): string | null {
  for (const entry of entries) {
    if (entry.type === "group" && entry.children.some((child) => child.tab === tab)) {
      return entry.id;
    }
  }
  return null;
}

export function findNavSectionForTab(entries: NavEntry[], tab: AdminTab): string | null {
  let currentSection: string | null = null;

  for (const entry of entries) {
    if (entry.type === "section") {
      currentSection = entry.label;
      continue;
    }
    if (entry.type === "item" && entry.tab === tab) return currentSection;
    if (entry.type === "group" && entry.children.some((child) => child.tab === tab)) return currentSection;
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
