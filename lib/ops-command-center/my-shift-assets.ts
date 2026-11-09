/** Exact My Shift graphics from RuffOps_Exact_My_Shift_Graphics_Asset_Pack. */
const PACK = "/assets/ruffops/my-shift/RuffOps_Exact_My_Shift_Asset_Pack";

export const MY_SHIFT_ASSETS = {
  pack: PACK,
  brandMark: "/assets/ruffops/brand/ruffops-mark.svg",
  brandWordmark: `${PACK}/04-icons/ruffops-wordmark-and-paw-transparent.png`,
  heroDog: `${PACK}/02-photos/shift-details-hero-dog.png`,
  pawWatermark: `${PACK}/05-ui-graphics/paw-watermark-reference.png`,
  sparkline: {
    blue: `${PACK}/05-ui-graphics/sparkline-blue.svg`,
    purple: `${PACK}/05-ui-graphics/sparkline-purple.svg`,
    green: `${PACK}/05-ui-graphics/sparkline-green.svg`,
    orange: `${PACK}/05-ui-graphics/sparkline-orange.svg`,
    cyan: `${PACK}/05-ui-graphics/sparkline-cyan.svg`
  },
  kpi: {
    dogs: `${PACK}/04-icons/kpi-dogs-paw-transparent.png`,
    boarding: `${PACK}/04-icons/kpi-boarding-bed-transparent.png`,
    taxi: `${PACK}/04-icons/kpi-taxi-car-transparent.png`,
    classes: `${PACK}/04-icons/kpi-classes-cap-transparent.png`,
    grooming: `${PACK}/04-icons/kpi-grooming-scissors-transparent.png`
  },
  panel: {
    calendar: `${PACK}/04-icons/shift-details-calendar-transparent.png`,
    tasks: `${PACK}/04-icons/tasks-checkbox-icon-transparent.png`,
    alerts: `${PACK}/04-icons/alerts-exclamation-icon-transparent.png`,
    team: `${PACK}/04-icons/team-people-icon-transparent.png`,
    lightning: `${PACK}/04-icons/quick-actions-lightning-transparent.png`,
    pulse: `${PACK}/04-icons/recent-activity-pulse-transparent.png`,
    userTile: `${PACK}/04-icons/shift-user-tile-icon-transparent.png`
  },
  quick: {
    addDog: `${PACK}/04-icons/quick-action-add-dog-transparent.png`,
    bookService: `${PACK}/04-icons/quick-action-book-service-transparent.png`,
    taxi: `${PACK}/04-icons/quick-action-schedule-taxi-transparent.png`,
    addClass: `${PACK}/04-icons/quick-action-add-class-transparent.png`,
    teamLog: `${PACK}/04-icons/quick-action-open-team-log-transparent.png`
  },
  portraits: {
    sarah: `${PACK}/03-avatars/team-sarah.png`,
    mike: `${PACK}/03-avatars/team-mike.png`,
    jenna: `${PACK}/03-avatars/team-jenna.png`,
    david: `${PACK}/03-avatars/team-david.png`,
    maria: `${PACK}/03-avatars/team-maria.png`
  },
  nav: {
    ops_command_center: `${PACK}/04-icons/sidebar-ops-command-transparent.png`,
    my_shift: `${PACK}/04-icons/sidebar-my-shift-transparent.png`,
    crossover_communication: `${PACK}/04-icons/sidebar-team-log-transparent.png`,
    user_interactions: `${PACK}/04-icons/sidebar-team-log-transparent.png`,
    active_issues: `${PACK}/04-icons/sidebar-active-issues-transparent.png`,
    sa_whiteboard_hub: `${PACK}/04-icons/sidebar-whiteboard-transparent.png`,
    push_notices: `${PACK}/04-icons/sidebar-whiteboard-transparent.png`,
    ms_hub: `${PACK}/04-icons/sidebar-support-transparent.png`,
    management_support: `${PACK}/04-icons/sidebar-support-transparent.png`,
    sa_people_hub: `${PACK}/04-icons/sidebar-people-hr-transparent.png`,
    staff_directory: `${PACK}/04-icons/sidebar-people-hr-transparent.png`,
    package_commissions: `${PACK}/04-icons/sidebar-commissions-transparent.png`,
    sa_admin_hub: `${PACK}/04-icons/sidebar-admin-transparent.png`,
    help: `${PACK}/04-icons/sidebar-help-center-transparent.png`
  } as Record<string, string>
} as const;

export function myShiftPortraitForName(name: string | null | undefined): string | null {
  const first = String(name || "")
    .trim()
    .split(/\s+/)[0]
    ?.toLowerCase();
  if (!first) return null;
  const portraits = MY_SHIFT_ASSETS.portraits as Record<string, string>;
  return portraits[first] || null;
}
