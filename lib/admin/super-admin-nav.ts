/**
 * Super Admin staff-panel IA: at most 10 sidebar tabs/icons.
 * Demoted tools stay fully accessible via hub launchers + deep links.
 */

import type { AdminTab } from "@/lib/admin/types";

export const SUPER_ADMIN_PRIMARY_TABS = [
  "my_shift",
  "ops_command_center",
  "sa_floor_hub",
  "sa_whiteboard_hub",
  "ms_hub",
  "sa_people_hub",
  "package_commissions",
  "sa_apps_hub",
  "sa_admin_hub",
  "help"
] as const satisfies readonly AdminTab[];

export type SuperAdminPrimaryTab = (typeof SUPER_ADMIN_PRIMARY_TABS)[number];

export type SuperAdminHubLink =
  | {
      kind: "tab";
      tab: AdminTab;
      label: string;
      description: string;
    }
  | {
      kind: "route";
      id: string;
      href: string;
      label: string;
      description: string;
    };

export type SuperAdminHubSection = {
  id: string;
  title: string;
  links: SuperAdminHubLink[];
};

export type SuperAdminHubDefinition = {
  tab: AdminTab;
  title: string;
  description: string;
  sections: SuperAdminHubSection[];
};

export const SUPER_ADMIN_HUB_TABS = [
  "sa_floor_hub",
  "sa_whiteboard_hub",
  "sa_people_hub",
  "sa_apps_hub",
  "sa_admin_hub"
] as const satisfies readonly AdminTab[];

export function isSuperAdminPrimaryTab(tab: AdminTab): boolean {
  return (SUPER_ADMIN_PRIMARY_TABS as readonly string[]).includes(tab);
}

export function isSuperAdminHubTab(tab: AdminTab): boolean {
  return (SUPER_ADMIN_HUB_TABS as readonly string[]).includes(tab);
}

function tabLink(tab: AdminTab, label: string, description: string): SuperAdminHubLink {
  return { kind: "tab", tab, label, description };
}

function routeLink(id: string, href: string, label: string, description: string): SuperAdminHubLink {
  return { kind: "route", id, href, label, description };
}

export const SUPER_ADMIN_HUBS: Record<(typeof SUPER_ADMIN_HUB_TABS)[number], SuperAdminHubDefinition> = {
  sa_floor_hub: {
    tab: "sa_floor_hub",
    title: "Floor Ops",
    description: "Command surfaces and day-to-day floor tools. Everything below still opens the full working page.",
    sections: [
      {
        id: "command",
        title: "Role command centers",
        links: [
          tabLink("front_desk_command", "Front Desk Command", "Arrivals, pickups, and front desk speed lane."),
          tabLink("ops_command_center", "Ops Command Center", "Live floor ops, tasks, alerts, and Gingr health."),
          tabLink("yard_command", "Yard Command", "Yard occupancy and next actions."),
          tabLink("driver_mode", "Driver / Hiker Mode", "Next-stop driver / hiker workflow."),
          tabLink("overnight_command", "Overnight Command", "Overnight rounds and escalations."),
          tabLink("trainer_ops", "Trainer Ops", "Training session ops around Gingr bookings."),
          tabLink("shift_handoff", "Shift Handoff", "Structured shift handoff with acknowledgement.")
        ]
      },
      {
        id: "operations",
        title: "Front desk & floor",
        links: [
          tabLink("crossover_communication", "Team Log", "Team handoff log between shifts."),
          tabLink("owner_follow_up", "Owner Follow Up", "Owner callbacks and follow-ups."),
          tabLink("active_issues", "Active Issues", "Open floor issues and escalations."),
          tabLink("fitdog_alerts", "Fitdog Alerts", "Payment failures and Fitdog sync alerts."),
          tabLink("vip_auto_book", "VIP Auto Book", "VIP clients who always want auto-booking."),
          tabLink("walks_board", "Walks Board", "Physical whiteboard walk-check alarm."),
          tabLink(
            "package_group_walks",
            "Package Group Walks",
            "Checked-in dogs whose package includes today's complimentary group walk."
          ),
          tabLink(
            "ruffops_checklist",
            "RuffOps Checklist",
            "Shared Gingr-style checklist for yard reminders, walks, meds, services, and alerts."
          ),
          tabLink("track_incidents", "Track Incidents", "Incident tracking with Gingr sync."),
          tabLink("vet_visits", "Vet Visits", "Vet visits and required owner follow-up."),
          tabLink("checklist", "Check List", "Personal handler checklist."),
          tabLink("write_ups", "Write Ups", "Submit your write-up forms."),
          tabLink("notifications", "Notifications", "Internal staff notifications."),
          tabLink("settings", "Settings", "Your Digi-Board settings / profile.")
        ]
      },
      {
        id: "media",
        title: "Photos & cameras",
        links: [
          tabLink("bulk_photo_upload", "Bulk Photo Upload", "Upload photos into Digi-Board."),
          tabLink("media_library", "Media Library", "Browse the RuffOps media archive."),
          tabLink("yard_links", "Video Links", "Yard camera and video links.")
        ]
      }
    ]
  },
  sa_whiteboard_hub: {
    tab: "sa_whiteboard_hub",
    title: "Whiteboard",
    description: "Push live content to staff displays, preview the board, and manage cast / TV setup.",
    sections: [
      {
        id: "push",
        title: "Push to whiteboard",
        links: [
          tabLink("push_notices", "Standard Notices", "Standard live notices and reminders."),
          tabLink("grooming_push", "Grooming Push", "Grooming ready alerts."),
          tabLink("trainer_push", "Trainer Push", "Trainer ready alerts."),
          tabLink("yard_push_notices", "Yard Camera Push", "Yard camera pushes."),
          tabLink("cast_videos", "Cast Videos", "Full-screen video casts."),
          tabLink("emergency_alerts", "Emergency Alerts", "Full-screen emergency alerts."),
          tabLink("demo_push", "Demo Push", "Demo-mode push notices.")
        ]
      },
      {
        id: "display",
        title: "Display & cast",
        links: [
          tabLink("whiteboard_preview", "Live Preview", "Live preview of the staff whiteboard."),
          tabLink("display", "TV & Cast Setup", "TV setup, cast URLs, and refresh settings."),
          tabLink("remote_cast", "Remote Whiteboard Cast", "Control building displays remotely."),
          tabLink("content", "Board Messages", "Board messages shown on the whiteboard.")
        ]
      }
    ]
  },
  sa_people_hub: {
    tab: "sa_people_hub",
    title: "People & HR",
    description: "Staff accounts, HR records, write-ups, and performance plans.",
    sections: [
      {
        id: "staff",
        title: "Staff",
        links: [
          tabLink("staff_directory", "Staff Directory", "Edit staff names, roles, and contact info."),
          tabLink("staff_create_user", "Create User", "Create a new staff admin login."),
          tabLink("users", "User Accounts", "Manage admin users, roles, and permissions.")
        ]
      },
      {
        id: "hr",
        title: "HR & reviews",
        links: [
          tabLink("hr_hub", "HR Records", "HR records command center."),
          tabLink("hr_consult", "HR Consult", "HR consult workspace."),
          tabLink("hr_pip", "Track PIP", "Track PIP / growth plans."),
          tabLink("write_ups", "Write Ups", "Submit and review write-ups."),
          tabLink("write_up_review", "Write Up Review", "Review all submitted write-ups."),
          tabLink("complaint_review", "Complaint Review", "Review staff and client complaints.")
        ]
      }
    ]
  },
  sa_apps_hub: {
    tab: "sa_apps_hub",
    title: "Apps",
    description: "Standalone RuffOps applications and connected systems.",
    sections: [
      {
        id: "ruffops_apps",
        title: "RuffOps apps",
        links: [
          tabLink("live_fleet", "Live Fleet", "Real-time Fitdog vans on the map with Samsara GPS."),
          tabLink("route_generator", "Route Generator", "Build van routes and Samsara exports."),
          routeLink(
            "gingr-route-generator",
            "/admin/gingr-route-generator",
            "Gingr Route Generator",
            "Generate operational routes directly from Gingr schedules."
          ),
          tabLink("ops_system_health", "System Health & Debugging", "System health, audits, and debug evidence."),
          routeLink(
            "automatic-blog",
            "/admin/automatic-blog",
            "Blog Generator",
            "Create and schedule Fitdog blog content."
          ),
          routeLink(
            "social-generator",
            "/admin/automatic-blog?page=social-generator",
            "Social Media Generator",
            "Create social posts from Fitdog blog content."
          )
        ]
      },
      {
        id: "connected",
        title: "Connected systems",
        links: [
          routeLink("gingr", "/gingr", "Gingr", "Open Gingr — business system of record."),
          routeLink("ruffly", "/ruffly", "Ruffly", "Open Ruffly AI / communications.")
        ]
      }
    ]
  },
  sa_admin_hub: {
    tab: "sa_admin_hub",
    title: "Admin",
    description: "System settings, insights, communications, and management utilities.",
    sections: [
      {
        id: "insights",
        title: "Insights",
        links: [
          tabLink("overview", "Overview", "Alerts, HR, PIP, tasks, and board health snapshot."),
          tabLink("reports", "Reports", "Checklist, photos, logins, Walks Board, Team Log, and support analytics."),
          tabLink("analytics", "Analytics", "Operational metrics summary.")
        ]
      },
      {
        id: "system",
        title: "System",
        links: [
          tabLink("settings", "Global Settings", "Global admin and whiteboard behavior."),
          tabLink("logs", "Activity Logs", "Audit trail of admin and system actions."),
          tabLink("integrations", "Integrations", "Gingr sync, webhooks, and connection status."),
          tabLink("tl_digi_board", "TL Digi Board", "Configure the Team Lead Alerts + Reminders display.")
        ]
      },
      {
        id: "comms",
        title: "Communications & support tools",
        links: [
          tabLink("templates", "Message Templates", "Reusable message templates."),
          tabLink("notifications", "Notifications", "Internal staff notifications."),
          tabLink("management_support", "Submit Request", "Submit a management support request."),
          tabLink("admin_trainer_entries", "Trainer Entries", "Review trainer entry submissions."),
          tabLink("ms_groomer_complaints", "Groomer Complaints", "Groomer complaints inbox (also in Support)."),
          tabLink("ms_trainer_complaints", "Trainer Complaints", "Trainer complaints inbox (also in Support)."),
          tabLink("ms_groomer_requests", "Groomer Requests", "Groomer requests inbox (also in Support)."),
          tabLink("ms_trainer_requests", "Trainer Requests", "Trainer requests inbox (also in Support).")
        ]
      }
    ]
  }
};

/** Map demoted tabs back to their Super Admin hub for a Back button. */
const TAB_TO_HUB: Partial<Record<AdminTab, AdminTab>> = (() => {
  const map: Partial<Record<AdminTab, AdminTab>> = {};
  for (const hub of Object.values(SUPER_ADMIN_HUBS)) {
    for (const section of hub.sections) {
      for (const link of section.links) {
        if (link.kind === "tab") map[link.tab] = hub.tab;
      }
    }
  }
  return map;
})();

export function parentHubForTab(tab: AdminTab): AdminTab | null {
  if (isSuperAdminPrimaryTab(tab)) return null;
  return TAB_TO_HUB[tab] ?? null;
}

export function hubLinkLabel(link: SuperAdminHubLink): string {
  return link.label;
}

/** Absolute in-app destination for an Apps / hub tile. */
export function hubLinkHref(link: SuperAdminHubLink): string {
  if (link.kind === "route") return link.href;
  return `/admin?board=staff&tab=${link.tab}`;
}

/** Flatten every hub-linked tab for coverage checks. */
export function allSuperAdminHubLinkedTabs(): AdminTab[] {
  const tabs = new Set<AdminTab>();
  for (const hub of Object.values(SUPER_ADMIN_HUBS)) {
    for (const section of hub.sections) {
      for (const link of section.links) {
        if (link.kind === "tab") tabs.add(link.tab);
      }
    }
  }
  return [...tabs];
}
