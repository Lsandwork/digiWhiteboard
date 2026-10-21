/**
 * Read-only Command Center launchpad — links to existing RuffOps modules.
 * Do not rebuild these tools here; navigate into the existing tab/page.
 */

export type CommandCenterLink = {
  tab: string;
  label: string;
  description: string;
  /** External in-app path when not an AdminTab (optional). */
  href?: string;
};

/** Shared module map for the unified Command Center overview. */
export const COMMAND_CENTER_MODULE_LINKS: CommandCenterLink[] = [
  { tab: "my_shift", label: "My Shift", description: "Role homepage and shift entry" },
  { tab: "front_desk_command", label: "Front Desk", description: "Arriving and checkout lanes" },
  { tab: "yard_command", label: "Yard Command", description: "Yard buckets and movement" },
  { tab: "crossover_communication", label: "Team Log", description: "Shift handoff notes" },
  { tab: "walks_board", label: "Walks Board", description: "Walk alarm and yard checks" },
  { tab: "body_checks", label: "Body Checks", description: "Ears, nails, and coat reports" },
  { tab: "fitdog_alerts", label: "Fitdog Alerts", description: "Payment and sync alerts" },
  { tab: "owner_follow_up", label: "Owner Follow-Ups", description: "Owner callbacks" },
  { tab: "active_issues", label: "Active Issues", description: "Open floor issues" },
  { tab: "ruffops_checklist", label: "RuffOps Checklist", description: "Shared yard checklist" },
  { tab: "route_generator", label: "Route Generator", description: "Transportation routes" },
  { tab: "live_fleet", label: "Live Fleet", description: "Van GPS and route progress" },
  { tab: "staff_directory", label: "Staff Directory", description: "People and departments" },
  { tab: "package_commissions", label: "Commissions", description: "Package commission tools" },
  { tab: "hr_hub", label: "HR Hub", description: "HR tools" },
  { tab: "ms_hub", label: "Support Hub", description: "Management support" },
  { tab: "ops_system_health", label: "System Health", description: "Integration health" },
  { tab: "overview", label: "Admin Overview", description: "Management dashboard" },
  { tab: "cast_tv", label: "CAST-TV", description: "Digital signage playlist" },
  { tab: "notifications", label: "Notifications", description: "Staff notifications" },
  { tab: "help", label: "Help", description: "Guides and how-tos" }
];

/** External apps already linked from Applications — do not embed. */
export const COMMAND_CENTER_EXTERNAL_LINKS: Array<{ href: string; label: string; description: string }> = [
  { href: "/gingr", label: "Gingr", description: "Business system of record" },
  { href: "/ruffly", label: "Ruffly", description: "Reviews and messaging" },
  { href: "/card-studio", label: "Card Studio", description: "Card design tools" }
];
