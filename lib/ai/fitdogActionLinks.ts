import { hasAnyPermission, hasPermission, type PermissionKey, type RoleKey, type UserAccess } from "@/lib/admin/permissions";

export type FitdogActionIntent =
  | "front_desk_log"
  | "file_complaint"
  | "complaints_filed"
  | "file_request"
  | "requests_filed"
  | "write_up_submit"
  | "write_up_review"
  | "grooming_push"
  | "push_notice"
  | "video_links"
  | "notifications"
  | "settings"
  | "staff_whiteboard"
  | "admin_panel"
  | "users"
  | "management_support"
  | "none";

export type FitdogActionLink = {
  label: string;
  href: string;
  reason?: string;
};

const STAFF = "/admin?board=staff";

type ActionConfig = {
  label: string;
  href: string;
  permissions?: PermissionKey[];
  roles?: RoleKey[];
};

export const FITDOG_ACTION_LINKS: Record<Exclude<FitdogActionIntent, "none">, ActionConfig> = {
  front_desk_log: {
    label: "Open Front Desk Log",
    href: `${STAFF}&tab=crossover_communication`,
    permissions: ["view_front_desk_log", "create_front_desk_log"]
  },
  file_complaint: {
    label: "File a Complaint",
    href: `${STAFF}&tab=management_support`,
    permissions: ["submit_groomer_complaint", "submit_trainer_complaint", "submit_write_up"]
  },
  complaints_filed: {
    label: "View My Filed Complaints",
    href: `${STAFF}&tab=management_support`,
    permissions: ["view_own_groomer_submissions", "view_own_trainer_submissions", "view_own_write_ups"]
  },
  file_request: {
    label: "File a Request",
    href: `${STAFF}&tab=management_support`,
    permissions: ["submit_groomer_request", "submit_trainer_request"]
  },
  requests_filed: {
    label: "View My Filed Requests",
    href: `${STAFF}&tab=management_support`,
    permissions: ["view_own_groomer_submissions", "view_own_trainer_submissions"]
  },
  write_up_submit: {
    label: "Submit Write-Up Request",
    href: `${STAFF}&tab=management_support`,
    permissions: ["submit_write_up"],
    roles: ["super_admin", "admin", "team_leader"]
  },
  write_up_review: {
    label: "Review Write-Up Status",
    href: `${STAFF}&tab=management_support`,
    permissions: ["view_own_write_ups", "review_write_ups"]
  },
  grooming_push: {
    label: "Create Grooming Push",
    href: `${STAFF}&tab=grooming_push`,
    permissions: ["push_grooming_request"]
  },
  push_notice: {
    label: "Open Push Notices",
    href: `${STAFF}&tab=push_notices`,
    permissions: ["manage_push_notices"]
  },
  video_links: {
    label: "Open Video Links",
    href: `${STAFF}&tab=yard_links`,
    permissions: ["view_admin_panel"]
  },
  notifications: {
    label: "Open My Notifications",
    href: `${STAFF}&tab=notifications`,
    permissions: ["view_admin_panel"]
  },
  settings: {
    label: "Open Settings",
    href: "/admin?tab=settings",
    permissions: ["view_admin_panel"]
  },
  staff_whiteboard: {
    label: "Open Staff Digital Whiteboard",
    href: "/",
    permissions: ["view_staff_whiteboard"]
  },
  admin_panel: {
    label: "Open Admin Panel",
    href: "/admin",
    roles: ["super_admin", "admin", "management"]
  },
  users: {
    label: "Open Users",
    href: "/admin?tab=users",
    permissions: ["manage_staff_users"]
  },
  management_support: {
    label: "Open Management Support",
    href: `${STAFF}&tab=management_support`,
    permissions: ["review_management_support", "submit_write_up", "submit_groomer_complaint", "submit_trainer_complaint"]
  }
};

const INTENT_ALIASES: Record<string, FitdogActionIntent> = {
  front_desk_log: "front_desk_log",
  file_complaint: "file_complaint",
  complaints_filed: "complaints_filed",
  file_request: "file_request",
  requests_filed: "requests_filed",
  write_up_submit: "write_up_submit",
  write_up_review: "write_up_review",
  grooming_push: "grooming_push",
  push_notice: "push_notice",
  push_notices: "push_notice",
  video_links: "video_links",
  notifications: "notifications",
  settings: "settings",
  staff_whiteboard: "staff_whiteboard",
  admin_panel: "admin_panel",
  users: "users",
  management_support: "management_support",
  none: "none"
};

export function normalizeActionIntent(value: unknown): FitdogActionIntent {
  const key = String(value ?? "none").trim().toLowerCase();
  return INTENT_ALIASES[key] ?? "none";
}

export function canAccessActionIntent(access: UserAccess, intent: FitdogActionIntent): boolean {
  if (intent === "none") return false;
  const config = FITDOG_ACTION_LINKS[intent];
  if (config.roles?.length && !config.roles.some((role) => access.roles.includes(role))) {
    return false;
  }
  if (config.permissions?.length) {
    return hasAnyPermission(access, config.permissions);
  }
  return hasPermission(access, "view_admin_panel");
}

export function actionLinkForIntent(access: UserAccess, intent: FitdogActionIntent, reason?: string): FitdogActionLink | null {
  if (intent === "none" || !canAccessActionIntent(access, intent)) return null;
  const config = FITDOG_ACTION_LINKS[intent];
  return { label: config.label, href: config.href, reason };
}

export function resolveActionLinks(
  access: UserAccess,
  primary: unknown,
  secondary?: unknown,
  extraIntents: FitdogActionIntent[] = []
): FitdogActionLink[] {
  const intents = [
    normalizeActionIntent(primary),
    normalizeActionIntent(secondary),
    ...extraIntents
  ].filter((intent) => intent !== "none");

  const links: FitdogActionLink[] = [];
  const seen = new Set<string>();

  for (const intent of intents) {
    const link = actionLinkForIntent(access, intent);
    if (!link || seen.has(link.href)) continue;
    seen.add(link.href);
    links.push(link);
  }

  return links;
}

export function allowedActionIntentsForUser(access: UserAccess): FitdogActionIntent[] {
  return (Object.keys(FITDOG_ACTION_LINKS) as Exclude<FitdogActionIntent, "none">[]).filter((intent) =>
    canAccessActionIntent(access, intent)
  );
}

export function fallbackActionLinks(access: UserAccess, tone?: string): FitdogActionLink[] {
  const urgent = tone === "urgent" || tone === "safety";
  const intents: FitdogActionIntent[] = urgent
    ? ["front_desk_log", "file_complaint", "notifications"]
    : ["file_request", "complaints_filed", "notifications"];

  if (canAccessActionIntent(access, "write_up_submit")) {
    intents.unshift("write_up_submit");
  }

  return resolveActionLinks(access, intents[0], intents[1], intents.slice(2));
}
