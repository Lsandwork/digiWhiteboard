/**
 * Staff-panel hub navigation for every Digi-Board role.
 * Max 10 primary sidebar tabs/icons; demoted tools stay on hub pages.
 */

import type { AdminTab } from "@/lib/admin/types";
import type { AdminUserRole } from "@/lib/admin/users";
import {
  SUPER_ADMIN_HUBS,
  SUPER_ADMIN_HUB_TABS,
  SUPER_ADMIN_PRIMARY_TABS,
  hubLinkHref,
  hubLinkLabel,
  isSuperAdminHubTab,
  parentHubForTab,
  type SuperAdminHubDefinition,
  type SuperAdminHubLink
} from "@/lib/admin/super-admin-nav";

export { hubLinkHref, hubLinkLabel };

export type RolePrimaryLeaf = {
  tab: AdminTab;
  label?: string;
};

export type RoleHubNavConfig = {
  sectionId: string;
  sectionLabel: string;
  primary: RolePrimaryLeaf[];
};

/** Roles that use the cleaned hub sidebar on the staff board. */
export const HUB_NAV_ROLES = [
  "owner_admin",
  "manager_admin",
  "assistant_manager",
  "front_desk_coordinator",
  "team_leader",
  "trainer",
  "groomer",
  "daycare",
  "driver",
  "hiker"
] as const satisfies readonly AdminUserRole[];

export type HubNavRole = (typeof HUB_NAV_ROLES)[number];

export function isHubNavRole(role?: string | null): role is HubNavRole {
  return Boolean(role && (HUB_NAV_ROLES as readonly string[]).includes(role));
}

const FULL_ADMIN_PRIMARY: RolePrimaryLeaf[] = SUPER_ADMIN_PRIMARY_TABS.map((tab) => {
  if (tab === "package_commissions") return { tab, label: "Commissions" };
  if (tab === "ms_hub") return { tab, label: "Support" };
  return { tab };
});

export const ROLE_HUB_NAV: Record<HubNavRole, RoleHubNavConfig> = {
  owner_admin: {
    sectionId: "super_admin_home",
    sectionLabel: "Super Admin",
    primary: FULL_ADMIN_PRIMARY
  },
  manager_admin: {
    sectionId: "admin_home",
    sectionLabel: "Admin",
    primary: FULL_ADMIN_PRIMARY
  },
  assistant_manager: {
    sectionId: "management_home",
    sectionLabel: "Management",
    primary: [
      { tab: "my_shift" },
      { tab: "ops_command_center" },
      { tab: "sa_floor_hub" },
      { tab: "sa_whiteboard_hub" },
      { tab: "ms_hub", label: "Support" },
      { tab: "sa_people_hub" },
      { tab: "package_commissions", label: "Commissions" },
      { tab: "sa_apps_hub" },
      { tab: "sa_admin_hub" },
      { tab: "help" }
    ]
  },
  front_desk_coordinator: {
    sectionId: "front_desk_home",
    sectionLabel: "Front Desk Coordinator",
    primary: [
      { tab: "my_shift" },
      { tab: "front_desk_command" },
      { tab: "sa_floor_hub" },
      { tab: "sa_whiteboard_hub" },
      { tab: "sa_apps_hub", label: "Apps" },
      { tab: "staff_directory" },
      { tab: "management_support", label: "Submit Request" },
      { tab: "notifications" },
      { tab: "settings" },
      { tab: "help" }
    ]
  },
  team_leader: {
    sectionId: "team_lead_home",
    sectionLabel: "Team Lead",
    primary: [
      { tab: "my_shift" },
      { tab: "yard_command" },
      { tab: "ruffops_checklist" },
      { tab: "sa_floor_hub" },
      { tab: "sa_whiteboard_hub" },
      { tab: "sa_apps_hub", label: "Apps" },
      { tab: "management_support", label: "Submit Request" },
      { tab: "settings" },
      { tab: "help" }
    ]
  },
  trainer: {
    sectionId: "trainer_home",
    sectionLabel: "Trainer",
    primary: [
      { tab: "my_shift" },
      { tab: "trainer_ops" },
      { tab: "trainer_push" },
      { tab: "package_commissions", label: "Commissions" },
      { tab: "sa_floor_hub" },
      { tab: "sa_apps_hub", label: "Apps" },
      { tab: "management_support", label: "Submit Request" },
      { tab: "notifications" },
      { tab: "settings" },
      { tab: "help" }
    ]
  },
  groomer: {
    sectionId: "groomer_home",
    sectionLabel: "Groomer",
    primary: [
      { tab: "my_shift" },
      { tab: "grooming_push" },
      { tab: "whiteboard_preview" },
      { tab: "sa_floor_hub" },
      { tab: "sa_apps_hub", label: "Apps" },
      { tab: "management_support", label: "Submit Request" },
      { tab: "notifications" },
      { tab: "settings" },
      { tab: "help" }
    ]
  },
  daycare: {
    sectionId: "handler_home",
    sectionLabel: "My Panel",
    primary: [
      { tab: "my_shift" },
      { tab: "driver_mode", label: "Driver / Hiker" },
      { tab: "sa_floor_hub" },
      { tab: "sa_apps_hub", label: "Apps" },
      { tab: "management_support", label: "Submit Request" },
      { tab: "notifications" },
      { tab: "settings" },
      { tab: "help" }
    ]
  },
  driver: {
    sectionId: "handler_home",
    sectionLabel: "My Panel",
    primary: [
      { tab: "my_shift" },
      { tab: "driver_mode" },
      { tab: "sa_floor_hub" },
      { tab: "sa_apps_hub", label: "Apps" },
      { tab: "management_support", label: "Submit Request" },
      { tab: "notifications" },
      { tab: "settings" },
      { tab: "help" }
    ]
  },
  hiker: {
    sectionId: "handler_home",
    sectionLabel: "My Panel",
    primary: [
      { tab: "my_shift" },
      { tab: "driver_mode", label: "Hiker Mode" },
      { tab: "sa_floor_hub" },
      { tab: "sa_apps_hub", label: "Apps" },
      { tab: "management_support", label: "Submit Request" },
      { tab: "notifications" },
      { tab: "settings" },
      { tab: "help" }
    ]
  }
};

export function rolePrimaryTabs(role: HubNavRole): AdminTab[] {
  return ROLE_HUB_NAV[role].primary.map((item) => item.tab);
}

export function roleUsesHubTab(role: string | null | undefined, tab: string): boolean {
  if (!isHubNavRole(role)) return false;
  return rolePrimaryTabs(role).includes(tab as AdminTab);
}

export function filterHubDefinition(
  hub: SuperAdminHubDefinition,
  visibleTabs: Iterable<AdminTab>,
  options?: {
    includeRuffly?: boolean;
    includeBlog?: boolean;
    includeRouteGenerator?: boolean;
    marketingAppsOnly?: boolean;
  }
): SuperAdminHubDefinition {
  const visible = new Set(visibleTabs);
  const sections = hub.sections
    .map((section) => ({
      ...section,
      links: section.links.filter((link) => {
        if (options?.marketingAppsOnly) {
          if (link.kind === "tab") return false;
          if (link.id === "ruffly") return options?.includeRuffly !== false;
          if (link.id === "automatic-blog" || link.id === "social-generator") {
            return options?.includeBlog === true;
          }
          return link.id === "gingr";
        }
        if (link.kind === "tab") return visible.has(link.tab);
        if (link.id === "ruffly") return options?.includeRuffly !== false;
        if (link.id === "automatic-blog" || link.id === "social-generator") {
          return options?.includeBlog === true;
        }
        if (link.id === "gingr-route-generator") {
          return options?.includeRouteGenerator === true;
        }
        return true;
      })
    }))
    .filter((section) => section.links.length > 0);

  return { ...hub, sections };
}

export function hubDefinitionForTab(
  hubTab: AdminTab,
  visibleTabs: Iterable<AdminTab>,
  options?: {
    includeRuffly?: boolean;
    includeBlog?: boolean;
    includeRouteGenerator?: boolean;
    marketingAppsOnly?: boolean;
  }
): SuperAdminHubDefinition | null {
  if (!isSuperAdminHubTab(hubTab)) return null;
  const key = hubTab as (typeof SUPER_ADMIN_HUB_TABS)[number];
  return filterHubDefinition(SUPER_ADMIN_HUBS[key], visibleTabs, options);
}

export function allHubLinkedTabsForVisible(visibleTabs: Iterable<AdminTab>): AdminTab[] {
  const visible = new Set(visibleTabs);
  const linked = new Set<AdminTab>();
  for (const hubTab of SUPER_ADMIN_HUB_TABS) {
    const hub = filterHubDefinition(SUPER_ADMIN_HUBS[hubTab], visible, {
      includeRuffly: true,
      includeBlog: true
    });
    for (const section of hub.sections) {
      for (const link of section.links) {
        if (link.kind === "tab") linked.add(link.tab);
      }
    }
  }
  return [...linked];
}

/** Ensure every demoted accessible tab is reachable from a hub the role can open. */
export function uncoveredVisibleTabs(role: HubNavRole, visibleTabs: AdminTab[]): AdminTab[] {
  const primary = new Set(rolePrimaryTabs(role));
  const linked = new Set(allHubLinkedTabsForVisible(visibleTabs));
  const alwaysHidden = new Set<AdminTab>(["trainer_entry", "handler_shift_entry"]);
  const lobbyOnly = new Set<AdminTab>(["promotions", "schedule", "lobby_slideshow", "cast_tv"]);

  return visibleTabs.filter((tab) => {
    if (primary.has(tab) || alwaysHidden.has(tab) || lobbyOnly.has(tab)) return false;
    if (isSuperAdminHubTab(tab)) return false;
    return !linked.has(tab);
  });
}

export { isSuperAdminHubTab, parentHubForTab, SUPER_ADMIN_HUB_TABS };
export type { SuperAdminHubDefinition, SuperAdminHubLink };

export const SIDEBAR_NEED_HELP_DISMISS_KEY = "fitdog_sidebar_need_help_dismissed";
