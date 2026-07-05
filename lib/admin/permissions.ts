/**
 * Centralized RBAC definitions for Fitdog Staff Digital Whiteboard Admin.
 * Roles grant permissions; users may hold multiple roles and departments.
 */

export type PermissionKey =
  | "view_admin_panel"
  | "view_staff_whiteboard"
  | "manage_push_notices"
  | "push_grooming_request"
  | "clear_grooming_request"
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
  | "configure_integrations"
  | "view_integration_status"
  | "manage_templates"
  | "receive_admin_alerts"
  | "manage_staff_directory";

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
  "manage_push_notices",
  "push_grooming_request",
  "clear_grooming_request",
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
  "configure_integrations",
  "view_integration_status",
  "manage_templates",
  "receive_admin_alerts",
  "manage_staff_directory"
] as const satisfies readonly PermissionKey[]);

const COORDINATOR_PERMISSIONS: PermissionKey[] = [
  "view_admin_panel",
  "view_staff_whiteboard",
  "manage_push_notices",
  "push_grooming_request",
  "clear_grooming_request",
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
  "view_integration_status"
];

const MANAGEMENT_PERMISSIONS: PermissionKey[] = [
  "view_admin_panel",
  "view_staff_whiteboard",
  "view_front_desk_log",
  "assign_front_desk_log",
  "resolve_front_desk_log",
  "view_owner_follow_up",
  "assign_owner_follow_up",
  "resolve_owner_follow_up",
  "view_active_issues",
  "assign_active_issue",
  "resolve_active_issue",
  "view_staff_directory",
  "view_integration_status",
  "receive_admin_alerts"
];

const GROOMER_TRAINER_PERMISSIONS: PermissionKey[] = [
  "view_admin_panel",
  "view_staff_whiteboard"
];

const STAFF_VIEWER_PERMISSIONS: PermissionKey[] = ["view_admin_panel", "view_staff_whiteboard"];

export const ROLE_PERMISSIONS: Record<RoleKey, PermissionKey[]> = {
  super_admin: [...ALL_PERMISSIONS],
  admin: [...ALL_PERMISSIONS],
  management: MANAGEMENT_PERMISSIONS,
  front_desk_coordinator: COORDINATOR_PERMISSIONS,
  team_leader: COORDINATOR_PERMISSIONS,
  groomer: GROOMER_TRAINER_PERMISSIONS,
  trainer: GROOMER_TRAINER_PERMISSIONS,
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
}): UserAccess {
  const roles = [...new Set([input.primaryRole, ...(input.roles ?? [])])];
  const departments = input.departments ?? [];
  return {
    userId: input.userId ?? null,
    email: input.email ?? null,
    primaryRole: input.primaryRole,
    roles,
    departments,
    permissions: permissionsForRoles(roles),
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
  crossover_communication: "view_front_desk_log",
  owner_follow_up: "view_owner_follow_up",
  active_issues: "view_active_issues",
  whiteboard_preview: "view_staff_whiteboard",
  templates: "manage_templates",
  notifications: "view_admin_panel",
  staff_directory: "view_staff_directory",
  users: "manage_staff_users",
  integrations: "view_integration_status",
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

export function canAccessAdminTab(
  access: UserAccess | null | undefined,
  tab: string,
  legacyRole?: string | null,
  board: "lobby" | "staff" = "lobby"
): boolean {
  const effective = access ?? accessFromLegacyRole(null, null, legacyRole);

  if (board === "staff" && (tab === "promotions" || tab === "schedule" || tab === "users")) {
    return false;
  }

  if (tab === "integrations") {
    return hasAnyPermission(effective, ["view_integration_status", "configure_integrations"]);
  }

  if (LOBBY_ONLY_TABS.has(tab)) {
    return canManageAdminUsers(effective, legacyRole) || hasPermission(effective, "configure_integrations");
  }

  const required = TAB_PERMISSIONS[tab];
  if (!required) return hasPermission(effective, "view_admin_panel");
  return hasPermission(effective, required);
}

export function firstAccessibleAdminTab(
  access: UserAccess | null | undefined,
  legacyRole?: string | null,
  board: "lobby" | "staff" = "staff"
): string {
  const tabs =
    board === "staff"
      ? [
          "push_notices",
          "crossover_communication",
          "owner_follow_up",
          "active_issues",
          "staff_directory",
          "whiteboard_preview",
          "yard_links",
          "templates",
          "notifications",
          "help"
        ]
      : ["overview", "content", "users", "settings", "integrations", "help"];

  for (const tab of tabs) {
    if (canAccessAdminTab(access, tab, legacyRole, board)) return tab;
  }
  return "help";
}
