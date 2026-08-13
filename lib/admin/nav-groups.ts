import type { AdminBoardType, AdminTab } from "@/lib/admin/types";
import { ADMIN_HR_TABS } from "@/lib/admin/types";
import { isHubNavRole, ROLE_HUB_NAV } from "@/lib/admin/role-hub-nav";

export type NavLeaf = {
  type: "item";
  tab: AdminTab;
  label: string;
};

export type NavRouteLeaf = {
  type: "route";
  id: "gingr" | "ruffly" | "automatic-blog";
  href: "/gingr" | "/ruffly" | "/admin/automatic-blog";
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

export type NavEntry = NavLeaf | NavRouteLeaf | NavGroup | NavSection;

/** Shared authenticated routes visible to every signed-in role. */
export const GINGR_NAV_ROUTE: NavRouteLeaf = {
  type: "route",
  id: "gingr",
  href: "/gingr",
  label: "Gingr"
};

export const RUFFLY_NAV_ROUTE: NavRouteLeaf = {
  type: "route",
  id: "ruffly",
  href: "/ruffly",
  label: "Ruffly"
};

export const AUTOMATIC_BLOG_NAV_ROUTE: NavRouteLeaf = {
  type: "route",
  id: "automatic-blog",
  href: "/admin/automatic-blog",
  label: "Blog Generator"
};

export function appendAuthenticatedGlobalRoutes(
  entries: NavEntry[],
  options?: {
    includeRuffly?: boolean;
    includeRouteGenerator?: boolean;
    includeSystemHealth?: boolean;
  }
): NavEntry[] {
  const globalSection: NavEntry[] = [section("global_apps", "Applications")];
  if (options?.includeRouteGenerator) {
    globalSection.push(leaf("route_generator"));
  }
  if (options?.includeSystemHealth) {
    globalSection.push(leaf("ops_system_health"));
  }
  globalSection.push(GINGR_NAV_ROUTE);
  if (options?.includeRuffly !== false) {
    globalSection.push(RUFFLY_NAV_ROUTE);
  }
  const helpIndex = entries.findIndex((entry) => entry.type === "section" && entry.id === "help");
  if (helpIndex >= 0) {
    return [...entries.slice(0, helpIndex), ...globalSection, ...entries.slice(helpIndex)];
  }
  return [...entries, ...globalSection];
}

/** Place Blog Generator under the Dashboard section (create the section when missing). */
export function insertBlogGeneratorIntoDashboard(entries: NavEntry[], includeBlog: boolean): NavEntry[] {
  if (!includeBlog) return entries;
  if (entries.some((entry) => entry.type === "route" && entry.id === "automatic-blog")) {
    return entries;
  }

  const dashboardIdx = entries.findIndex(
    (entry) => entry.type === "section" && entry.id === "staff_dashboard"
  );
  if (dashboardIdx >= 0) {
    // Keep Blog Generator near the top of Dashboard so it is not buried under the fold.
    let sectionEnd = dashboardIdx + 1;
    while (sectionEnd < entries.length && entries[sectionEnd].type !== "section") {
      sectionEnd += 1;
    }
    const insertAt = sectionEnd > dashboardIdx + 1 ? Math.min(dashboardIdx + 1, sectionEnd) : dashboardIdx + 1;
    return [...entries.slice(0, insertAt), AUTOMATIC_BLOG_NAV_ROUTE, ...entries.slice(insertAt)];
  }

  const dashboardBlock: NavEntry[] = [section("staff_dashboard", "Dashboard"), AUTOMATIC_BLOG_NAV_ROUTE];
  const anchorIdx = entries.findIndex(
    (entry) =>
      entry.type === "section" && (entry.id === "global_apps" || entry.id === "help" || entry.id === "marketing_board")
  );
  if (anchorIdx >= 0) {
    return [...entries.slice(0, anchorIdx), ...dashboardBlock, ...entries.slice(anchorIdx)];
  }
  return [...dashboardBlock, ...entries];
}

const TAB_LABELS: Record<AdminTab, string> = {
  checklist: "Check List",
  overview: "Overview",
  content: "Board Messages",
  promotions: "Promotions",
  schedule: "Class Schedule",
  lobby_slideshow: "Slideshow Upload",
  cast_tv: "CAST-TV",
  display: "TV & Cast Setup",
  push_notices: "Standard Notices",
  yard_push_notices: "Yard Camera Push",
  emergency_alerts: "Emergency Alerts",
  grooming_push: "Grooming Push",
  trainer_push: "Trainer Push",
  cast_videos: "Cast Videos",
  trainer_entry: "Trainer's Entry",
  crossover_communication: "Team Log",
  owner_follow_up: "Owner Follow Up",
  active_issues: "Active Issues",
  whiteboard_preview: "Live Preview",
  yard_links: "Video Links",
  management_support: "Submit Request",
  ms_hub: "Support Command Center",
  ms_groomer_complaints: "Groomer Complaints",
  ms_groomer_requests: "Groomer Requests",
  ms_trainer_complaints: "Trainer Complaints",
  ms_trainer_requests: "Trainer Requests",
  admin_trainer_entries: "Trainer Entries",
  package_commissions: "Package & Class Commissions",
  track_incidents: "Track Incidents",
  fitdog_alerts: "Fitdog Alerts",
  vet_visits: "Vet Visits",
  vip_auto_book: "VIP Auto Book",
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
  media_library: "Media Library",
  write_ups: "Write Ups",
  write_up_review: "Write Up Review",
  complaint_review: "Complaint Review",
  handler_shift_entry: "Handler Shift Entry Log",
  hr_pip: "Track PIP",
  remote_cast: "Remote Whiteboard Cast",
  walks_board: "Walks Board",
  route_generator: "Route Generator",
  my_shift: "My Shift",
  ops_command_center: "Ops Command Center",
  front_desk_command: "Front Desk Command",
  yard_command: "Yard Command",
  driver_mode: "Driver / Hiker Mode",
  overnight_command: "Overnight Command",
  trainer_ops: "Trainer Ops",
  ops_system_health: "System Health & Debugging",
  shift_handoff: "Shift Handoff",
  sa_floor_hub: "Floor Ops",
  sa_whiteboard_hub: "Whiteboard",
  sa_people_hub: "People & HR",
  sa_apps_hub: "Apps",
  sa_admin_hub: "Admin"
};

const TAB_DESCRIPTIONS: Partial<Record<AdminTab, string>> = {
  checklist: "Personal handler checklist for daily shift tasks.",
  overview: "Live snapshot of alerts, HR, PIP, tasks, staffing, and board health.",
  my_shift: "Role-aware homepage with needs-attention, tasks, dogs, and alerts.",
  ops_command_center: "Live Fitdog operating state for management — dogs, tasks, alerts, Gingr health.",
  front_desk_command: "Arriving, ready for pickup, checkout, and owner contact speed lane.",
  yard_command: "Yard occupancy and next actions for Team Leads.",
  driver_mode: "Mobile next-stop workflow with offline-safe completion.",
  overnight_command: "Overnight rounds, meds, and escalation.",
  trainer_ops: "Training session ops around Gingr bookings.",
  ops_system_health:
    "Live observability, route audits, integration failures, and Cursor debug evidence — without secrets.",
  shift_handoff: "Structured shift handoff with acknowledgement.",
  sa_floor_hub: "Open floor command centers, operations tools, photos, and cameras from one place.",
  sa_whiteboard_hub: "Push notices, preview the board, and manage TV / cast setup.",
  sa_people_hub: "Staff directory, HR records, write-ups, and PIP tracking.",
  sa_apps_hub: "Route Generator, System Health, Blog Generator, Gingr, and Ruffly.",
  sa_admin_hub: "Overview, analytics, settings, logs, integrations, and admin utilities.",
  content: "Edit the messages guests and staff see on the whiteboard.",
  admin_trainer_entries: "View all shift log entries submitted through Trainer's Entry.",
  promotions: "Manage lobby promotion cards shown during idle time.",
  schedule: "Edit the weekly class schedule on the lobby display.",
  lobby_slideshow: "Upload photos and videos that are added to the lobby idle slideshow.",
  cast_tv: "Manage the photo and video playlist shown on the CAST-TV display.",
  display: "Cast display URLs, TV setup checklist, and board refresh settings.",
  push_notices: "Send live reminders and alerts to the staff whiteboard.",
  yard_push_notices: "Push yard camera feeds to the staff whiteboard.",
  emergency_alerts: "Full-screen urgent alerts for the staff whiteboard.",
  grooming_push: "Alert handlers when a dog needs grooming.",
  trainer_push: "Alert handlers when a dog needs training.",
  cast_videos: "Upload and push full-screen videos to displays.",
  trainer_entry: "Retired — use Team Log.",
  handler_shift_entry: "Retired — use Team Log.",
  package_commissions: "Track package and class sales, confirm commissions, and review trainer earnings.",
  track_incidents: "Track Gingr and manual incident reports with live webhook sync and a 5:00 AM Pacific catch-up.",
  fitdog_alerts: "Failed payments, missed payments, card issues, and Fitdog sync health under Operations.",
  vet_visits: "Log vet visits, alert admin/management, and track required owner follow-up until resolved.",
  vip_auto_book: "Track clients who always want dogs booked on app.fitdog.com for classes, hikes, and excursions.",
  crossover_communication: "Team handoff log between shifts.",
  owner_follow_up: "Track owner follow-ups and callbacks.",
  active_issues: "Monitor open floor issues and escalations.",
  whiteboard_preview: "Preview what is live on the whiteboard right now.",
  yard_links: "Manage yard camera and video links.",
  management_support: "Submit complaints, requests, and write-ups.",
  ms_hub: "Command center for urgent alerts, PIPs, complaints, requests, compliance, and AI-assisted manager actions.",
  templates: "Reusable message templates for staff communications.",
  notifications: "Internal staff notifications and replies.",
  walks_board: "Track recurring walks for No Plays, Groomed Dogs, and Break Dogs.",
  route_generator: "Pull Fitdog reports, build van routes, export Samsara CSVs, and track owner SMS / live maps.",
  staff_directory: "Edit staff names, roles, and contact info.",
  staff_create_user: "Create a new staff admin login.",
  users: "Manage admin users, roles, and permissions.",
  settings: "Global admin and whiteboard behavior settings.",
  logs: "Audit trail of admin actions and system events.",
  integrations: "Gingr sync, webhooks, and connection status.",
  help: "Setup guides and how-to articles.",
  analytics: "Operational metrics and board activity summary.",
  demo_push: "Try push notices in demo mode.",
  bulk_photo_upload: "Upload, store, view, and download photos in Digi-Board.",
  media_library: "Browse all uploaded photos and videos in the RuffOps cloud archive.",
  write_ups: "Submit and review your own write-up forms.",
  write_up_review: "Review all submitted employee write-ups.",
  complaint_review: "Review groomer, trainer, and staff complaints.",
  hr_pip: "Supportive growth plans with AI coaching, California-aware documentation, and manager check-ins.",
  remote_cast: "Control lobby and staff whiteboards on building displays from anywhere."
};

const LOBBY_BOARD_TABS: AdminTab[] = [
  "content",
  "promotions",
  "schedule",
  "lobby_slideshow",
  "bulk_photo_upload",
  "media_library",
  "display",
  "whiteboard_preview"
];
const MARKETING_BOARD_NAV_TABS: AdminTab[] = ["cast_tv", "settings", "help"];
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
  "fitdog_alerts",
  "vip_auto_book",
  "walks_board"
];

const MEDIA_TABS: AdminTab[] = ["yard_links"];
const COMMISSIONS_TABS: AdminTab[] = ["package_commissions"];
const SUPPORT_COMPLAINT_TABS: AdminTab[] = ["ms_groomer_complaints", "ms_trainer_complaints"];
const SUPPORT_REQUEST_TABS: AdminTab[] = ["ms_trainer_requests", "ms_groomer_requests"];
const COMMS_TABS: AdminTab[] = ["templates", "notifications"];
const ADMIN_SYSTEM_TABS: AdminTab[] = ["users", "settings", "logs", "integrations"];
const MANAGEMENT_FLOOR_TABS: AdminTab[] = ["track_incidents", "vet_visits", "vip_auto_book"];

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

/** Sole navigable tab under a section (ignoring nested groups with multiple children). */
export function findSoleLeafTab(entries: Array<Exclude<NavEntry, { type: "section" }>>): AdminTab | null {
  const leafTabs: AdminTab[] = [];
  for (const entry of entries) {
    if (entry.type === "item") leafTabs.push(entry.tab);
    else if (entry.type === "group") {
      if (entry.children.length !== 1) return null;
      leafTabs.push(entry.children[0]!.tab);
    } else {
      return null;
    }
  }
  return leafTabs.length === 1 ? leafTabs[0]! : null;
}

/** Build sidebar nav for the CAST-TV / Marketing admin board. */
export function buildMarketingAdminNav(visibleTabs: AdminTab[]): NavEntry[] {
  const visible = new Set(visibleTabs);
  return sectionEntries(
    "marketing_board",
    "CAST-TV",
    compactEntries([
      ...singles(["cast_tv"], visible),
      group("marketing_settings", "Settings", ["settings", "help"], visible)
    ]),
    true
  );
}

/** Build a grouped sidebar nav from the tabs the user can access. */
export function buildAdminNav(visibleTabs: AdminTab[], board: AdminBoardType): NavEntry[] {
  const visible = new Set(visibleTabs);

  if (board === "marketing") {
    return buildMarketingAdminNav(visibleTabs);
  }

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
        // Route Generator lives under Applications (with Gingr / Ruffly).
        singles(
          [
            "my_shift",
            "ops_command_center",
            "front_desk_command",
            "yard_command",
            "driver_mode",
            "overnight_command",
            "trainer_ops",
            "shift_handoff",
            // Flat Dashboard leaf — one click opens Commissions (no nested section).
            "package_commissions",
            "demo_push",
            "overview",
            "whiteboard_preview",
            "display",
            "remote_cast",
            "content",
            "analytics",
            "checklist"
          ],
          visible
        ).map((item) => (item.tab === "package_commissions" ? leaf("package_commissions", "Commissions") : item))
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
          ...singles(["bulk_photo_upload", "media_library"], visible)
        ])
      )
    );

    entries.push(
      ...sectionEntries(
        "staff_management",
        "Management",
        compactEntries([
          ...singles(["ms_hub", "management_support"], visible),
          group("support_complaints", "Complaints", SUPPORT_COMPLAINT_TABS, visible),
          group("support_requests", "Requests", SUPPORT_REQUEST_TABS, visible),
          ...singles(["admin_trainer_entries", ...MANAGEMENT_FLOOR_TABS], visible)
        ]),
        true
      )
    );

    entries.push(
      ...sectionEntries(
        "staff_people",
        "People & HR",
        compactEntries([
          group("people_directory", "Staff", ["staff_directory", "staff_create_user"], visible),
          group("human_resources", "Human Resources", [...ADMIN_HR_TABS], visible),
          ...singles(["hr_pip"], visible)
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
      "trainer_home",
      "My Shift",
      compactEntries([...singles(["my_shift", "trainer_ops"], visible)])
    )
  );

  entries.push(
    ...sectionEntries(
      "trainer_push",
      "Push to Whiteboard",
      compactEntries([group("trainer_live_alerts", "Live Alerts", ["trainer_push"], visible)])
    )
  );

  entries.push(
    ...sectionEntries(
      "trainer_operations",
      "Front Desk & Floor",
      compactEntries([group("front_desk", "Operations", ["crossover_communication"], visible)])
    )
  );

  entries.push(
    ...sectionEntries(
      "trainer_commissions",
      "Commissions",
      COMMISSIONS_TABS.filter((tab) => visible.has(tab)).map((tab) => leaf(tab, "Commissions"))
    )
  );

  entries.push(
    ...sectionEntries(
      "trainer_support",
      "Management",
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

/** Team Lead panel nav — write-up submit lives under Management, not Front Desk & Floor. */
export function buildTeamLeadNav(visibleTabs: AdminTab[]): NavEntry[] {
  const visible = new Set(visibleTabs);
  const entries: NavEntry[] = [];

  entries.push(
    ...sectionEntries(
      "team_lead_home",
      "My Shift",
      compactEntries([...singles(["my_shift", "yard_command", "shift_handoff"], visible)])
    )
  );

  entries.push(
    ...sectionEntries(
      "team_lead_push",
      "Push to Whiteboard",
      compactEntries([
        group("push_to_board", "Live Alerts", ["push_notices", "yard_push_notices", "grooming_push"], visible),
        ...singles(["whiteboard_preview"], visible)
      ])
    )
  );

  entries.push(
    ...sectionEntries(
      "team_lead_operations",
      "Front Desk & Floor",
      compactEntries([
        group("front_desk", "Operations", ["crossover_communication", "owner_follow_up", "active_issues"], visible),
        ...singles(["bulk_photo_upload", "media_library"], visible)
      ])
    )
  );

  entries.push(
    ...sectionEntries(
      "team_lead_management_support",
      "Management",
      compactEntries([...singles(["management_support"], visible)])
    )
  );

  entries.push(
    ...sectionEntries(
      "team_lead_comms",
      "Communications",
      compactEntries([...singles(["notifications", "yard_links", "walks_board"], visible)])
    )
  );

  entries.push(
    ...sectionEntries(
      "team_lead_admin",
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

/** Groomer panel nav — grooming workflows without empty admin review sections. */
export function buildGroomerNav(visibleTabs: AdminTab[]): NavEntry[] {
  const visible = new Set(visibleTabs);
  const entries: NavEntry[] = [];

  entries.push(
    ...sectionEntries(
      "groomer_home",
      "My Shift",
      compactEntries([...singles(["my_shift"], visible)])
    )
  );

  entries.push(
    ...sectionEntries(
      "groomer_push",
      "Push to Whiteboard",
      compactEntries([
        group("groomer_live_alerts", "Live Alerts", ["grooming_push"], visible),
        ...singles(["whiteboard_preview"], visible)
      ])
    )
  );

  entries.push(
    ...sectionEntries(
      "groomer_operations",
      "Front Desk & Floor",
      compactEntries([group("front_desk", "Operations", ["crossover_communication"], visible)])
    )
  );

  entries.push(
    ...sectionEntries(
      "groomer_support",
      "Management",
      compactEntries([...singles(["management_support"], visible)])
    )
  );

  entries.push(
    ...sectionEntries(
      "groomer_comms",
      "Communications",
      compactEntries([...singles(["notifications", "yard_links", "walks_board"], visible)])
    )
  );

  entries.push(
    ...sectionEntries(
      "groomer_admin",
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

export function roleCanSeeRufflyNav(role?: string | null) {
  if (!role) return false;
  return (
    role === "owner_admin" ||
    role === "manager_admin" ||
    role === "assistant_manager" ||
    role === "front_desk_coordinator" ||
    role === "team_leader" ||
    role === "marketing" ||
    role === "trainer" ||
    role === "groomer"
  );
}

/** Blog Generator nav — Super Admin, Admin, and Marketing only. */
export function roleCanSeeBlogNav(role?: string | null) {
  if (!role) return false;
  return role === "owner_admin" || role === "manager_admin" || role === "marketing";
}

/**
 * Hub-based staff sidebar for a role: max 10 primary tabs/icons.
 * Demoted tools remain reachable from hub pages (permissions unchanged).
 */
export function buildRoleHubStaffNav(visibleTabs: AdminTab[], role: string): NavEntry[] {
  if (!isHubNavRole(role)) return [];
  const config = ROLE_HUB_NAV[role];
  const visible = new Set(visibleTabs);
  const leaves = config.primary
    .filter((item) => visible.has(item.tab))
    .slice(0, 10)
    .map((item) => leaf(item.tab, item.label));
  return sectionEntries(config.sectionId, config.sectionLabel, leaves);
}

/** @deprecated use buildRoleHubStaffNav — kept for Super Admin call sites/tests */
export function buildSuperAdminNav(visibleTabs: AdminTab[]): NavEntry[] {
  return buildRoleHubStaffNav(visibleTabs, "owner_admin");
}

/** Pick the staff-panel sidebar layout for the signed-in role. */
export function buildStaffPanelNav(
  visibleTabs: AdminTab[],
  board: AdminBoardType,
  role?: string | null
): NavEntry[] {
  // Cleaned hub IA for staff roles (≤10 tabs). Lobby/marketing boards keep board-specific nav.
  if (board === "staff" && isHubNavRole(role)) {
    return buildRoleHubStaffNav(visibleTabs, role);
  }

  let entries: NavEntry[];
  if (role === "trainer") entries = buildTrainerNav(visibleTabs);
  else if (role === "team_leader") entries = buildTeamLeadNav(visibleTabs);
  else if (role === "groomer") entries = buildGroomerNav(visibleTabs);
  else entries = buildAdminNav(visibleTabs, board);
  entries = insertBlogGeneratorIntoDashboard(entries, roleCanSeeBlogNav(role));
  return appendAuthenticatedGlobalRoutes(entries, {
    includeRuffly: roleCanSeeRufflyNav(role),
    includeRouteGenerator: visibleTabs.includes("route_generator"),
    includeSystemHealth: visibleTabs.includes("ops_system_health")
  });
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
  if (board === "marketing" && tab === "cast_tv") {
    return "Manage the photo and video playlist shown on casttv.ruffops.com.";
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

export function findNavSectionIdForTab(entries: NavEntry[], tab: AdminTab): string | null {
  let currentSectionId: string | null = null;

  for (const entry of entries) {
    if (entry.type === "section") {
      currentSectionId = entry.id;
      continue;
    }
    if (entry.type === "item" && entry.tab === tab) return currentSectionId;
    if (entry.type === "group" && entry.children.some((child) => child.tab === tab)) return currentSectionId;
  }

  return null;
}

export function findNavSectionIdForPath(entries: NavEntry[], path: string | null | undefined): string | null {
  if (!path) return null;
  let currentSectionId: string | null = null;

  for (const entry of entries) {
    if (entry.type === "section") {
      currentSectionId = entry.id;
      continue;
    }
    if (entry.type === "route" && entry.href === path) return currentSectionId;
  }

  return null;
}

export type NavSectionBucket = {
  section: Extract<NavEntry, { type: "section" }> | null;
  children: Array<Exclude<NavEntry, { type: "section" }>>;
};

/** Group flat nav entries into collapsible section buckets. */
export function bucketNavEntries(entries: NavEntry[]): NavSectionBucket[] {
  const buckets: NavSectionBucket[] = [];
  let current: NavSectionBucket = { section: null, children: [] };

  for (const entry of entries) {
    if (entry.type === "section") {
      if (current.section || current.children.length) buckets.push(current);
      current = { section: entry, children: [] };
      continue;
    }
    current.children.push(entry);
  }

  if (current.section || current.children.length) buckets.push(current);
  return buckets;
}

export function isTabInNav(entries: NavEntry[], tab: AdminTab) {
  for (const entry of entries) {
    if (entry.type === "item" && entry.tab === tab) return true;
    if (entry.type === "group" && entry.children.some((child) => child.tab === tab)) return true;
  }
  return false;
}
