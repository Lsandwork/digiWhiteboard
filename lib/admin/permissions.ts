/**
 * Centralized RBAC definitions for Fitdog Staff Digital Whiteboard Admin.
 * Roles grant permissions; users may hold multiple roles and departments.
 */

export type PermissionKey =
  | "view_admin_panel"
  | "view_staff_whiteboard"
  | "manage_staff_whiteboard"
  | "manage_push_notices"
  | "manage_cast_videos"
  | "push_grooming_request"
  | "clear_grooming_request"
  | "push_yard_notice"
  | "view_front_desk_log"
  | "create_front_desk_log"
  | "edit_front_desk_log"
  | "assign_front_desk_log"
  | "resolve_front_desk_log"
  | "view_owner_follow_up"
  | "create_owner_follow_up"
  | "edit_owner_follow_up"
  | "assign_owner_follow_up"
  | "resolve_owner_follow_up"
  | "view_active_issues"
  | "create_active_issue"
  | "edit_active_issue"
  | "assign_active_issue"
  | "resolve_active_issue"
  | "view_staff_directory"
  | "manage_staff_users"
  | "reset_user_password"
  | "force_password_change"
  | "view_user_groups_permissions"
  | "manage_user_groups_permissions"
  | "manage_system_settings"
  | "configure_integrations"
  | "view_integrations"
  | "view_integration_status"
  | "view_api_access"
  | "manage_api_keys"
  | "view_gingr_sync_settings"
  | "manage_gingr_sync_settings"
  | "manage_gemini_settings"
  | "manage_database_tools"
  | "manage_templates"
  | "receive_admin_alerts"
  | "manage_staff_directory"
  | "submit_write_up"
  | "view_own_write_ups"
  | "review_write_ups"
  | "submit_groomer_complaint"
  | "submit_groomer_request"
  | "view_own_groomer_submissions"
  | "push_trainer_request"
  | "clear_trainer_request"
  | "create_trainer_entry"
  | "submit_trainer_complaint"
  | "submit_trainer_request"
  | "view_own_trainer_submissions"
  | "view_package_commissions"
  | "comment_package_commissions"
  | "manage_package_commissions"
  | "review_management_support"
  | "view_notifications"
  | "respond_to_notifications"
  | "assign_notifications"
  | "view_internal_notes"
  | "create_internal_notes"
  | "view_video_links"
  | "manage_video_links"
  | "use_fitdog_ai"
  | "view_hr_hub"
  | "use_hr_consult"
  | "view_analytics"
  | "export_reports"
  | "view_admin_logs";

export type RoleKey =
  | "super_admin"
  | "admin"
  | "management"
  | "front_desk_coordinator"
  | "team_leader"
  | "groomer"
  | "daycare"
  | "trainer"
  | "driver"
  | "hiker"
  | "overnight"
  | "maintenance"
  | "staff"
  | "viewer";

export type DepartmentKey =
  | "front_desk"
  | "management"
  | "daycare"
  | "grooming"
  | "training"
  | "transportation"
  | "overnight"
  | "maintenance"
  | "admin";

export type UserAccess = {
  userId: string | null;
  email: string | null;
  primaryRole: RoleKey;
  roles: RoleKey[];
  departments: DepartmentKey[];
  permissions: PermissionKey[];
  displayLabel: string;
};

export const ROLE_LABELS: Record<RoleKey, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  management: "Management",
  front_desk_coordinator: "Front Desk - Coordinator",
  team_leader: "Team Lead",
  groomer: "Groomer",
  daycare: "Daycare",
  trainer: "Trainer",
  driver: "Driver",
  hiker: "Hiker",
  overnight: "Overnight",
  maintenance: "Maintenance",
  staff: "Staff",
  viewer: "Viewer"
};

export const DEPARTMENT_LABELS: Record<DepartmentKey, string> = {
  front_desk: "Front Desk",
  management: "Management",
  daycare: "Daycare",
  grooming: "Grooming",
  training: "Training",
  transportation: "Transportation",
  overnight: "Overnight",
  maintenance: "Maintenance",
  admin: "Admin"
};

/** Front Desk Coordinator and Team Leader share identical operational permissions. */
export const COORDINATOR_LIKE_ROLES: RoleKey[] = ["front_desk_coordinator", "team_leader"];

const ALL_PERMISSIONS = Object.freeze([
  "view_admin_panel",
  "view_staff_whiteboard",
  "manage_staff_whiteboard",
  "manage_push_notices",
  "manage_cast_videos",
  "push_grooming_request",
  "clear_grooming_request",
  "push_yard_notice",
  "view_front_desk_log",
  "create_front_desk_log",
  "edit_front_desk_log",
  "assign_front_desk_log",
  "resolve_front_desk_log",
  "view_owner_follow_up",
  "create_owner_follow_up",
  "edit_owner_follow_up",
  "assign_owner_follow_up",
  "resolve_owner_follow_up",
  "view_active_issues",
  "create_active_issue",
  "edit_active_issue",
  "assign_active_issue",
  "resolve_active_issue",
  "view_staff_directory",
  "manage_staff_users",
  "reset_user_password",
  "force_password_change",
  "view_user_groups_permissions",
  "manage_user_groups_permissions",
  "manage_system_settings",
  "configure_integrations",
  "view_integrations",
  "view_integration_status",
  "view_api_access",
  "manage_api_keys",
  "view_gingr_sync_settings",
  "manage_gingr_sync_settings",
  "manage_gemini_settings",
  "manage_database_tools",
  "manage_templates",
  "receive_admin_alerts",
  "manage_staff_directory",
  "submit_write_up",
  "view_own_write_ups",
  "review_write_ups",
  "submit_groomer_complaint",
  "submit_groomer_request",
  "view_own_groomer_submissions",
  "push_trainer_request",
  "clear_trainer_request",
  "create_trainer_entry",
  "submit_trainer_complaint",
  "submit_trainer_request",
  "view_own_trainer_submissions",
  "view_package_commissions",
  "comment_package_commissions",
  "manage_package_commissions",
  "review_management_support",
  "view_notifications",
  "respond_to_notifications",
  "assign_notifications",
  "view_internal_notes",
  "create_internal_notes",
  "view_video_links",
  "manage_video_links",
  "use_fitdog_ai",
  "view_hr_hub",
  "use_hr_consult",
  "view_analytics",
  "export_reports",
  "view_admin_logs"
] as const satisfies readonly PermissionKey[]);

/** Permissions reserved for Super Admin — Admin cannot receive these by default. */
export const SUPER_ADMIN_ONLY_PERMISSIONS = new Set<PermissionKey>([
  "view_user_groups_permissions",
  "manage_user_groups_permissions",
  "view_integrations",
  "configure_integrations",
  "view_integration_status",
  "view_api_access",
  "manage_api_keys",
  "view_gingr_sync_settings",
  "manage_gingr_sync_settings",
  "manage_gemini_settings",
  "manage_database_tools"
]);

const ADMIN_OPERATIONAL_PERMISSIONS: PermissionKey[] = ALL_PERMISSIONS.filter(
  (permission) => !SUPER_ADMIN_ONLY_PERMISSIONS.has(permission)
);

const STAFF_NOTIFICATION_PERMISSIONS: PermissionKey[] = [
  "view_notifications",
  "respond_to_notifications"
];

const STAFF_VIDEO_AI_PERMISSIONS: PermissionKey[] = [
  "view_video_links",
  "use_fitdog_ai"
];

const COORDINATOR_PERMISSIONS: PermissionKey[] = [
  "view_admin_panel",
  "view_staff_whiteboard",
  "manage_push_notices",
  "manage_cast_videos",
  "push_grooming_request",
  "clear_grooming_request",
  "push_yard_notice",
  "view_front_desk_log",
  "create_front_desk_log",
  "edit_front_desk_log",
  "assign_front_desk_log",
  "resolve_front_desk_log",
  "view_owner_follow_up",
  "create_owner_follow_up",
  "edit_owner_follow_up",
  "assign_owner_follow_up",
  "resolve_owner_follow_up",
  "view_active_issues",
  "create_active_issue",
  "edit_active_issue",
  "assign_active_issue",
  "resolve_active_issue",
  "view_staff_directory",
  "manage_templates",
  ...STAFF_NOTIFICATION_PERMISSIONS,
  ...STAFF_VIDEO_AI_PERMISSIONS
];

const MANAGEMENT_PERMISSIONS: PermissionKey[] = [
  "view_admin_panel",
  "view_staff_whiteboard",
  "manage_staff_whiteboard",
  "manage_push_notices",
  "manage_cast_videos",
  "push_grooming_request",
  "clear_grooming_request",
  "push_yard_notice",
  "view_front_desk_log",
  "create_front_desk_log",
  "edit_front_desk_log",
  "assign_front_desk_log",
  "resolve_front_desk_log",
  "view_owner_follow_up",
  "assign_owner_follow_up",
  "resolve_owner_follow_up",
  "view_active_issues",
  "assign_active_issue",
  "resolve_active_issue",
  "view_staff_directory",
  "receive_admin_alerts",
  "review_management_support",
  "review_write_ups",
  "manage_package_commissions",
  "view_hr_hub",
  "use_hr_consult",
  "view_analytics",
  "export_reports",
  ...STAFF_NOTIFICATION_PERMISSIONS,
  "assign_notifications",
  "view_internal_notes",
  "create_internal_notes",
  ...STAFF_VIDEO_AI_PERMISSIONS
];

/** Trainer DigiBoard panel — trainer push, shift log entry, video links, notifications, complaints/requests/commissions, profile. */
const TRAINER_PERMISSIONS: PermissionKey[] = [
  "view_admin_panel",
  "view_staff_whiteboard",
  "push_trainer_request",
  "clear_trainer_request",
  "create_trainer_entry",
  "submit_trainer_complaint",
  "submit_trainer_request",
  "view_own_trainer_submissions",
  "view_package_commissions",
  "comment_package_commissions",
  ...STAFF_NOTIFICATION_PERMISSIONS,
  ...STAFF_VIDEO_AI_PERMISSIONS
];

/** Groomer DigiBoard panel — grooming push, front desk log, video links, notifications, complaints/requests, profile. */
const GROOMER_PERMISSIONS: PermissionKey[] = [
  "view_admin_panel",
  "view_staff_whiteboard",
  "view_front_desk_log",
  "create_front_desk_log",
  "edit_front_desk_log",
  "push_grooming_request",
  "clear_grooming_request",
  "submit_groomer_complaint",
  "submit_groomer_request",
  "view_own_groomer_submissions",
  ...STAFF_NOTIFICATION_PERMISSIONS,
  ...STAFF_VIDEO_AI_PERMISSIONS
];

const STAFF_VIEWER_PERMISSIONS: PermissionKey[] = [
  "view_admin_panel",
  "view_staff_whiteboard",
  "view_front_desk_log",
  "create_front_desk_log",
  "edit_front_desk_log",
  ...STAFF_NOTIFICATION_PERMISSIONS,
  ...STAFF_VIDEO_AI_PERMISSIONS
];

/** Team Lead DigiBoard panel — push, grooming, front desk log, video links, notifications, write-ups, profile. */
const TEAM_LEADER_PERMISSIONS: PermissionKey[] = [
  "view_admin_panel",
  "manage_push_notices",
  "manage_cast_videos",
  "push_grooming_request",
  "clear_grooming_request",
  "push_yard_notice",
  "view_front_desk_log",
  "create_front_desk_log",
  "edit_front_desk_log",
  "submit_write_up",
  "view_own_write_ups",
  ...STAFF_NOTIFICATION_PERMISSIONS,
  ...STAFF_VIDEO_AI_PERMISSIONS
];

export const TEAM_LEADER_TABS = [
  "push_notices",
  "yard_push_notices",
  "grooming_push",
  "crossover_communication",
  "yard_links",
  "notifications",
  "management_support",
  "settings"
] as const;

export const GROOMER_TABS = [
  "grooming_push",
  "crossover_communication",
  "yard_links",
  "notifications",
  "management_support",
  "settings"
] as const;

export const TRAINER_TABS = [
  "trainer_push",
  "trainer_entry",
  "yard_links",
  "notifications",
  "management_support",
  "settings"
] as const;

export const ROLE_PERMISSIONS: Record<RoleKey, PermissionKey[]> = {
  super_admin: [...ALL_PERMISSIONS],
  admin: [...ADMIN_OPERATIONAL_PERMISSIONS],
  management: [...MANAGEMENT_PERMISSIONS],
  front_desk_coordinator: COORDINATOR_PERMISSIONS,
  team_leader: TEAM_LEADER_PERMISSIONS,
  groomer: GROOMER_PERMISSIONS,
  trainer: TRAINER_PERMISSIONS,
  daycare: STAFF_VIEWER_PERMISSIONS,
  driver: STAFF_VIEWER_PERMISSIONS,
  hiker: STAFF_VIEWER_PERMISSIONS,
  overnight: STAFF_VIEWER_PERMISSIONS,
  maintenance: STAFF_VIEWER_PERMISSIONS,
  staff: STAFF_VIEWER_PERMISSIONS,
  viewer: STAFF_VIEWER_PERMISSIONS
};

/** Map legacy admin_users.role values to RBAC role keys. */
export function legacyRoleToRoleKey(role?: string | null): RoleKey {
  switch (role) {
    case "owner_admin":
      return "super_admin";
    case "manager_admin":
      return "admin";
    case "front_desk_coordinator":
    case "front_desk":
    case "coordinator":
      return "front_desk_coordinator";
    case "team_leader":
      return "team_leader";
    case "groomer":
      return "groomer";
    case "trainer":
      return "trainer";
    case "viewer":
      return "viewer";
    default:
      return "admin";
  }
}

/** Map RBAC primary role back to legacy admin_users.role for DB storage. */
export function roleKeyToLegacyRole(role: RoleKey): string {
  switch (role) {
    case "super_admin":
      return "owner_admin";
    case "admin":
    case "management":
      return "manager_admin";
    case "front_desk_coordinator":
      return "front_desk_coordinator";
    case "team_leader":
      return "team_leader";
    case "groomer":
      return "groomer";
    case "trainer":
      return "trainer";
    default:
      return "viewer";
  }
}

export function permissionsForRoles(roles: RoleKey[]): PermissionKey[] {
  const set = new Set<PermissionKey>();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role] ?? []) {
      set.add(permission);
    }
  }
  return [...set];
}

export function buildDisplayLabel(roles: RoleKey[]): string {
  if (!roles.length) return "Staff";
  const primary = ROLE_LABELS[roles[0]] ?? roles[0];
  if (roles.length === 1) return primary;
  const extra = roles.slice(1).map((r) => ROLE_LABELS[r] ?? r);
  if (roles.length === 2) return `${primary} + ${extra[0]}`;
  return `${primary} +${roles.length - 1} roles`;
}

export function buildUserAccess(input: {
  userId?: string | null;
  email?: string | null;
  primaryRole: RoleKey;
  roles?: RoleKey[];
  departments?: DepartmentKey[];
  permissions?: PermissionKey[];
}): UserAccess {
  const roles = [...new Set([input.primaryRole, ...(input.roles ?? [])])];
  const departments = input.departments ?? [];
  return {
    userId: input.userId ?? null,
    email: input.email ?? null,
    primaryRole: input.primaryRole,
    roles,
    departments,
    permissions: input.permissions ?? permissionsForRoles(roles),
    displayLabel: buildDisplayLabel(roles)
  };
}

export function accessFromLegacyRole(userId: string | null, email: string | null, legacyRole?: string | null): UserAccess {
  const primaryRole = legacyRoleToRoleKey(legacyRole);
  return buildUserAccess({ userId, email, primaryRole, roles: [primaryRole] });
}

export function hasPermission(access: UserAccess | null | undefined, permission: PermissionKey): boolean {
  if (!access) return false;
  return access.permissions.includes(permission);
}

export function hasAnyPermission(access: UserAccess | null | undefined, permissions: PermissionKey[]): boolean {
  return permissions.some((p) => hasPermission(access, p));
}

export function hasRole(access: UserAccess | null | undefined, role: RoleKey): boolean {
  if (!access) return false;
  return access.roles.includes(role);
}

export function hasAnyRole(access: UserAccess | null | undefined, roles: RoleKey[]): boolean {
  return roles.some((r) => hasRole(access, r));
}

export const TAB_PERMISSIONS: Partial<Record<string, PermissionKey>> = {
  push_notices: "manage_push_notices",
  yard_push_notices: "push_yard_notice",
  emergency_alerts: "manage_push_notices",
  cast_videos: "manage_cast_videos",
  grooming_push: "push_grooming_request",
  trainer_push: "push_trainer_request",
  trainer_entry: "create_trainer_entry",
  crossover_communication: "view_front_desk_log",
  owner_follow_up: "view_owner_follow_up",
  active_issues: "view_active_issues",
  whiteboard_preview: "view_staff_whiteboard",
  yard_links: "view_video_links",
  templates: "manage_templates",
  notifications: "view_notifications",
  staff_directory: "view_staff_directory",
  staff_create_user: "manage_staff_users",
  users: "manage_staff_users",
  integrations: "view_integrations",
  analytics: "view_analytics",
  logs: "view_admin_logs",
  management_support: "submit_write_up",
  package_commissions: "manage_package_commissions",
  ms_hub: "review_management_support",
  ms_groomer_complaints: "review_management_support",
  ms_groomer_requests: "review_management_support",
  ms_trainer_complaints: "review_management_support",
  ms_trainer_requests: "review_management_support",
  admin_trainer_entries: "review_management_support",
  hr_hub: "view_hr_hub",
  hr_consult: "use_hr_consult",
  settings: "view_admin_panel",
  help: "view_admin_panel"
};

export function canAccessTab(access: UserAccess | null | undefined, tab: string, legacyRole?: string | null): boolean {
  const effective = access ?? accessFromLegacyRole(null, null, legacyRole);
  const required = TAB_PERMISSIONS[tab];
  if (!required) return hasPermission(effective, "view_admin_panel");
  return hasPermission(effective, required);
}

export function effectiveAccessLabel(access: UserAccess | null | undefined, legacyRole?: string | null, email?: string | null): string {
  if (access?.displayLabel) return access.displayLabel;
  const key = legacyRoleToRoleKey(legacyRole);
  if (email?.trim().toLowerCase() === "contact@fitdog.com") return ROLE_LABELS.front_desk_coordinator;
  return ROLE_LABELS[key] ?? "Admin";
}

/** Preview labels for admin user form. */
export const PERMISSION_PREVIEW_LABELS: Partial<Record<PermissionKey, string>> = {
  manage_push_notices: "Push Notices",
  manage_cast_videos: "Cast Videos",
  view_front_desk_log: "Front Desk Log",
  view_owner_follow_up: "Owner Follow Up",
  view_active_issues: "Active Issues",
  push_grooming_request: "Grooming Requests",
  view_staff_whiteboard: "Whiteboard Preview",
  view_staff_directory: "Staff Directory",
  view_integration_status: "Integrations Status",
  manage_templates: "Templates",
  receive_admin_alerts: "Management Alerts"
};

export function previewLabelsForAccess(access: UserAccess): string[] {
  return Object.entries(PERMISSION_PREVIEW_LABELS)
    .filter(([key]) => hasPermission(access, key as PermissionKey))
    .map(([, label]) => label as string);
}

export function canChangeAdminUserPassword(
  actorAccess: UserAccess | null,
  actorLegacyRole: string | undefined,
  targetUserId: string,
  actorUserId?: string
): boolean {
  if (actorUserId && actorUserId === targetUserId) return true;
  if (hasPermission(actorAccess, "reset_user_password")) return true;
  return actorLegacyRole === "owner_admin" || actorLegacyRole === "manager_admin" || !actorLegacyRole;
}

export function canManageAdminUsers(actorAccess: UserAccess | null, actorLegacyRole?: string | null): boolean {
  if (hasPermission(actorAccess, "manage_staff_users")) return true;
  return actorLegacyRole === "owner_admin" || actorLegacyRole === "manager_admin" || !actorLegacyRole;
}

/** Lobby board chrome (switcher, cast refresh) — full admins only. */
export function isStaffPanelLimitedAccess(access: UserAccess | null | undefined, legacyRole?: string | null): boolean {
  if (canManageAdminUsers(access ?? null, legacyRole)) return false;
  if (hasPermission(access, "configure_integrations")) return false;
  return true;
}

const LOBBY_ONLY_TABS = new Set([
  "overview",
  "content",
  "promotions",
  "schedule",
  "display",
  "analytics",
  "logs"
]);

const ADMIN_SUPPORT_TAB_SET = new Set([
  "ms_hub",
  "ms_groomer_complaints",
  "ms_groomer_requests",
  "ms_trainer_complaints",
  "ms_trainer_requests",
  "admin_trainer_entries"
]);

const ADMIN_HR_TAB_SET = new Set(["hr_hub", "hr_consult"]);

export function isSuperAdminLegacyRole(legacyRole?: string | null) {
  return legacyRole === "owner_admin";
}

export function isSuperAdminAccess(access: UserAccess | null | undefined) {
  return hasRole(access, "super_admin");
}

export function canManageSuperAdminUsers(actorAccess: UserAccess | null, actorLegacyRole?: string | null) {
  return isSuperAdminAccess(actorAccess) || isSuperAdminLegacyRole(actorLegacyRole);
}

export function isTeamLeaderLegacyRole(legacyRole?: string | null) {
  return legacyRole === "team_leader";
}

export function isGroomerLegacyRole(legacyRole?: string | null) {
  return legacyRole === "groomer";
}

export function isTrainerLegacyRole(legacyRole?: string | null) {
  return legacyRole === "trainer";
}

export function canAccessAdminTab(
  access: UserAccess | null | undefined,
  tab: string,
  legacyRole?: string | null,
  board: "lobby" | "staff" = "lobby",
  options?: { isDemo?: boolean }
): boolean {
  if (tab === "demo_push") return options?.isDemo === true && board === "staff";

  const effective = access ?? accessFromLegacyRole(null, null, legacyRole);

  if (isTeamLeaderLegacyRole(legacyRole)) {
    if (board !== "staff") return false;
    return (TEAM_LEADER_TABS as readonly string[]).includes(tab);
  }

  if (isGroomerLegacyRole(legacyRole)) {
    if (board !== "staff") return false;
    return (GROOMER_TABS as readonly string[]).includes(tab);
  }

  if (isTrainerLegacyRole(legacyRole)) {
    if (board !== "staff") return false;
    if (tab === "management_support") return hasAnyPermission(effective, ["submit_trainer_complaint", "view_own_trainer_submissions", "view_package_commissions"]);
    return (TRAINER_TABS as readonly string[]).includes(tab);
  }

  if (ADMIN_SUPPORT_TAB_SET.has(tab)) {
    if (board !== "staff") return false;
    if (isGroomerLegacyRole(legacyRole) || isTeamLeaderLegacyRole(legacyRole) || isTrainerLegacyRole(legacyRole)) return false;
    return hasPermission(effective, "review_management_support");
  }

  if (ADMIN_HR_TAB_SET.has(tab)) {
    if (board !== "staff") return false;
    if (isGroomerLegacyRole(legacyRole) || isTeamLeaderLegacyRole(legacyRole) || isTrainerLegacyRole(legacyRole)) return false;
    const required = TAB_PERMISSIONS[tab];
    return required ? hasPermission(effective, required) : false;
  }

  if (
    tab === "management_support" &&
    hasPermission(effective, "review_management_support") &&
    !isTeamLeaderLegacyRole(legacyRole) &&
    !isGroomerLegacyRole(legacyRole) &&
    !isTrainerLegacyRole(legacyRole)
  ) {
    return false;
  }

  if (hasPermission(effective, "manage_package_commissions") && tab === "package_commissions") {
    return board === "staff";
  }

  if (board === "staff" && (tab === "promotions" || tab === "schedule" || tab === "users")) {
    return false;
  }

  if (tab === "staff_create_user") {
    return (
      hasAnyRole(effective, ["super_admin", "admin", "management"]) || isSuperAdminLegacyRole(legacyRole)
    );
  }

  if (tab === "integrations") {
    return hasAnyPermission(effective, ["view_integrations", "view_integration_status", "configure_integrations"]);
  }

  if (tab === "logs") {
    return hasAnyPermission(effective, ["view_admin_logs", "configure_integrations"]);
  }

  if (tab === "analytics") {
    return hasPermission(effective, "view_analytics") || canManageAdminUsers(effective, legacyRole);
  }

  if (tab === "notifications") {
    return hasAnyPermission(effective, ["view_notifications", "view_admin_panel"]);
  }

  if (tab === "yard_links") {
    return hasAnyPermission(effective, ["view_video_links", "view_admin_panel"]);
  }

  if (LOBBY_ONLY_TABS.has(tab)) {
    return (
      canManageAdminUsers(effective, legacyRole) ||
      hasAnyPermission(effective, ["configure_integrations", "view_integrations", "manage_staff_whiteboard"])
    );
  }

  const required = TAB_PERMISSIONS[tab];
  if (!required) return hasPermission(effective, "view_admin_panel");
  if (tab === "management_support" && hasAnyPermission(effective, ["submit_trainer_complaint", "view_own_trainer_submissions", "view_package_commissions"])) {
    return true;
  }
  return hasPermission(effective, required);
}

/** Every authenticated dashboard user can open the Front Desk Communications Log. */
export function canAccessFrontDeskLogForRole(role?: string | null) {
  const access = accessFromLegacyRole(null, null, role);
  return hasPermission(access, "view_front_desk_log");
}

/** Every authenticated dashboard user can submit new Front Desk log entries. */
export function canCreateFrontDeskLogForRole(role?: string | null) {
  const access = accessFromLegacyRole(null, null, role);
  return hasPermission(access, "create_front_desk_log");
}

export function firstAccessibleAdminTab(
  access: UserAccess | null | undefined,
  legacyRole?: string | null,
  board: "lobby" | "staff" = "staff",
  options?: { isDemo?: boolean }
): string {
  if (options?.isDemo && board === "staff") return "demo_push";

  if (isTeamLeaderLegacyRole(legacyRole) && board === "staff") {
    for (const tab of TEAM_LEADER_TABS) {
      if (canAccessAdminTab(access, tab, legacyRole, board, options)) return tab;
    }
    return "push_notices";
  }

  if (isGroomerLegacyRole(legacyRole) && board === "staff") {
    for (const tab of GROOMER_TABS) {
      if (canAccessAdminTab(access, tab, legacyRole, board, options)) return tab;
    }
    return "grooming_push";
  }

  if (isTrainerLegacyRole(legacyRole) && board === "staff") {
    for (const tab of TRAINER_TABS) {
      if (canAccessAdminTab(access, tab, legacyRole, board, options)) return tab;
    }
    return "trainer_push";
  }

  const tabs =
    board === "staff"
      ? [
          "push_notices",
          "grooming_push",
          "crossover_communication",
          "owner_follow_up",
          "active_issues",
          "staff_directory",
          "whiteboard_preview",
          "yard_links",
          "templates",
          "notifications",
          "package_commissions",
          "ms_hub",
          "help"
        ]
      : ["overview", "content", "users", "settings", "integrations", "help"];

  for (const tab of tabs) {
    if (canAccessAdminTab(access, tab, legacyRole, board, options)) return tab;
  }
  return "help";
}
