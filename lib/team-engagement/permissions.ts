import {
  ENGAGEMENT_SUPER_ADMIN_ONLY_PERMISSIONS,
  teamEngagementTier,
  type DepartmentKey,
  type PermissionKey,
  type TeamEngagementTier,
  type UserAccess
} from "@/lib/admin/permissions";
import { OPERATIONAL_DEPARTMENTS, isEngagementDepartment, type FeatureKey } from "@/lib/team-engagement/constants";

export type { TeamEngagementTier };
export { teamEngagementTier };

export type EngagementPermission = Extract<PermissionKey, `engagement.${string}`>;

export const ENGAGEMENT_PERMISSION_KEYS: EngagementPermission[] = [
  "engagement.view",
  "engagement.view_all_departments",
  "engagement.participate",
  "engagement.create_bark_out",
  "engagement.manage_team",
  "engagement.manage_departments",
  "engagement.moderate",
  "engagement.manage_programs",
  "engagement.manage_settings",
  "engagement.view_analytics",
  "engagement.export",
  "engagement.view_audit_logs",
  "engagement.manage_permissions",
  "engagement.configure_ai",
  "engagement.manage_security",
  "engagement.manage_integrations"
];

const PARTICIPANT_PERMISSIONS = new Set<EngagementPermission>(["engagement.participate", "engagement.create_bark_out"]);

const TIER_RANK: Record<TeamEngagementTier, number> = { management: 1, admin: 2, super_admin: 3 };

export function tierRank(tier: TeamEngagementTier | null | undefined): number {
  return tier ? TIER_RANK[tier] : 0;
}

export const TIER_LABELS: Record<TeamEngagementTier, string> = {
  management: "Management",
  admin: "Admin",
  super_admin: "Super Admin"
};

/**
 * The permission set this person can actually exercise. Leadership keys need a leadership tier, and
 * Super Admin-only keys need the Super Admin tier, no matter what the stored role matrix says.
 */
export function effectiveEngagementPermissions(
  access: UserAccess | null | undefined,
  legacyRole?: string | null
): EngagementPermission[] {
  const tier = teamEngagementTier(access, legacyRole);
  const granted = new Set(access?.permissions ?? []);
  return ENGAGEMENT_PERMISSION_KEYS.filter((permission) => {
    if (tier === "super_admin") return true;
    if (!granted.has(permission)) return false;
    if (PARTICIPANT_PERMISSIONS.has(permission)) return true;
    if (!tier) return false;
    return !ENGAGEMENT_SUPER_ADMIN_ONLY_PERMISSIONS.has(permission);
  });
}

export type DepartmentScope = {
  all: boolean;
  departments: DepartmentKey[];
};

/**
 * Admin and Super Admin see every department through `engagement.view_all_departments`. Management sees
 * only operational departments assigned to them, either on their account or as a department manager.
 */
export function resolveDepartmentScope(input: {
  tier: TeamEngagementTier | null;
  permissions: readonly EngagementPermission[];
  accountDepartments: readonly string[];
  managedDepartments: readonly string[];
}): DepartmentScope {
  if (!input.tier) return { all: false, departments: [] };
  if (input.tier === "super_admin") return { all: true, departments: [] };
  if (input.permissions.includes("engagement.view_all_departments")) return { all: true, departments: [] };
  const assigned = new Set<DepartmentKey>();
  for (const value of [...input.accountDepartments, ...input.managedDepartments]) {
    if (isEngagementDepartment(value) && OPERATIONAL_DEPARTMENTS.includes(value)) assigned.add(value);
  }
  return { all: false, departments: OPERATIONAL_DEPARTMENTS.filter((key) => assigned.has(key)) };
}

export function scopeIncludesDepartments(scope: DepartmentScope, departments: readonly string[]): boolean {
  if (scope.all) return true;
  return departments.some((department) => (scope.departments as string[]).includes(department));
}

export type EmployeeRecordSubject = {
  userId: string;
  departments: readonly string[];
  tier: TeamEngagementTier | null;
};

/**
 * Leadership can open an employee's engagement records only inside their department scope, never their
 * own, and never for someone at the same or a higher tier (Super Admin excepted for peers).
 */
export function canAccessEmployeeRecord(
  viewer: { userId: string; tier: TeamEngagementTier | null; scope: DepartmentScope },
  subject: EmployeeRecordSubject
): boolean {
  if (!viewer.tier) return false;
  if (viewer.userId === subject.userId) return false;
  if (viewer.tier !== "super_admin" && tierRank(subject.tier) >= tierRank(viewer.tier)) return false;
  if (viewer.scope.all) return true;
  if (subject.tier) return false;
  return scopeIncludesDepartments(viewer.scope, subject.departments);
}

export type ViewRule = {
  permission: EngagementPermission;
  superAdminOnly?: boolean;
};

/** GET views of `/api/admin/team-engagement`. Every view is checked on the server before any read. */
export const LEADERSHIP_VIEW_RULES = {
  context: { permission: "engagement.view" },
  overview: { permission: "engagement.view" },
  staff: { permission: "engagement.view" },
  profile: { permission: "engagement.view" },
  avatar: { permission: "engagement.view" },
  bark_outs: { permission: "engagement.view" },
  moderation: { permission: "engagement.moderate" },
  workload: { permission: "engagement.view_analytics" },
  development: { permission: "engagement.manage_team" },
  feedback: { permission: "engagement.manage_team" },
  announcements: { permission: "engagement.view" },
  programs: { permission: "engagement.view" },
  analytics: { permission: "engagement.view_analytics" },
  reports: { permission: "engagement.view_analytics" },
  departments: { permission: "engagement.view" },
  employees: { permission: "engagement.view" },
  audit: { permission: "engagement.view_audit_logs" },
  settings: { permission: "engagement.manage_settings" },
  access: { permission: "engagement.manage_permissions", superAdminOnly: true },
  permissions: { permission: "engagement.manage_permissions", superAdminOnly: true },
  ai_policy: { permission: "engagement.configure_ai", superAdminOnly: true },
  security: { permission: "engagement.manage_security", superAdminOnly: true },
  retention: { permission: "engagement.manage_security", superAdminOnly: true },
  features: { permission: "engagement.manage_security", superAdminOnly: true },
  integrations: { permission: "engagement.manage_integrations", superAdminOnly: true },
  system_health: { permission: "engagement.manage_integrations", superAdminOnly: true }
} as const satisfies Record<string, ViewRule>;
export type LeadershipView = keyof typeof LEADERSHIP_VIEW_RULES;

export type ActionRule = ViewRule & {
  feature?: FeatureKey;
};

/** POST actions of `/api/admin/team-engagement`. */
export const LEADERSHIP_ACTION_RULES = {
  create_bark_out: { permission: "engagement.create_bark_out", feature: "bark_outs" },
  confirm_bark_out: { permission: "engagement.create_bark_out", feature: "bark_outs" },
  withdraw_bark_out: { permission: "engagement.create_bark_out" },
  react_bark_out: { permission: "engagement.participate", feature: "reactions" },
  unreact_bark_out: { permission: "engagement.participate", feature: "reactions" },
  approve_bark_out: { permission: "engagement.moderate" },
  reject_bark_out: { permission: "engagement.moderate" },
  remove_bark_out: { permission: "engagement.moderate" },
  escalate_bark_out: { permission: "engagement.moderate" },
  resolve_report: { permission: "engagement.moderate" },
  save_development_record: { permission: "engagement.manage_team", feature: "development" },
  respond_feedback: { permission: "engagement.manage_team", feature: "feedback" },
  update_feedback: { permission: "engagement.manage_team", feature: "feedback" },
  note_feedback: { permission: "engagement.manage_team", feature: "feedback" },
  create_announcement: { permission: "engagement.manage_team", feature: "announcements" },
  archive_announcement: { permission: "engagement.manage_team", feature: "announcements" },
  nominate: { permission: "engagement.manage_team", feature: "programs" },
  withdraw_nomination: { permission: "engagement.manage_team", feature: "programs" },
  save_program: { permission: "engagement.manage_programs", feature: "programs" },
  decide_nomination: { permission: "engagement.manage_programs", feature: "programs" },
  save_department: { permission: "engagement.manage_departments" },
  assign_department_manager: { permission: "engagement.manage_departments" },
  remove_department_manager: { permission: "engagement.manage_departments" },
  save_categories: { permission: "engagement.manage_settings" },
  save_participation: { permission: "engagement.manage_settings" },
  save_ai_policy: { permission: "engagement.configure_ai", superAdminOnly: true },
  test_ai_connection: { permission: "engagement.configure_ai", superAdminOnly: true },
  save_features: { permission: "engagement.manage_security", superAdminOnly: true },
  save_retention: { permission: "engagement.manage_security", superAdminOnly: true },
  run_retention_purge: { permission: "engagement.manage_security", superAdminOnly: true },
  change_role: { permission: "engagement.manage_permissions", superAdminOnly: true },
  set_role_permission: { permission: "engagement.manage_permissions", superAdminOnly: true }
} as const satisfies Record<string, ActionRule>;
export type LeadershipAction = keyof typeof LEADERSHIP_ACTION_RULES;

/** Employee feed actions of `/api/admin/bark-outs`. These never need a leadership tier. */
export const PARTICIPANT_ACTION_RULES = {
  create_bark_out: { permission: "engagement.create_bark_out", feature: "bark_outs" },
  confirm_bark_out: { permission: "engagement.create_bark_out", feature: "bark_outs" },
  withdraw_bark_out: { permission: "engagement.create_bark_out" },
  react_bark_out: { permission: "engagement.participate", feature: "reactions" },
  unreact_bark_out: { permission: "engagement.participate", feature: "reactions" },
  report_bark_out: { permission: "engagement.participate", feature: "concern_reports" },
  submit_feedback: { permission: "engagement.participate", feature: "feedback" },
  save_preferences: { permission: "engagement.participate" }
} as const satisfies Record<string, ActionRule>;
export type ParticipantAction = keyof typeof PARTICIPANT_ACTION_RULES;

export type RuleDecision = { allowed: true } | { allowed: false; status: 401 | 403; reason: string };

export function evaluateRule(
  rule: ViewRule,
  actor: { tier: TeamEngagementTier | null; permissions: readonly EngagementPermission[] },
  options: { leadership: boolean }
): RuleDecision {
  if (options.leadership && !actor.tier) {
    return { allowed: false, status: 403, reason: "leadership_required" };
  }
  if (rule.superAdminOnly && actor.tier !== "super_admin") {
    return { allowed: false, status: 403, reason: "super_admin_required" };
  }
  if (!actor.permissions.includes(rule.permission)) {
    return { allowed: false, status: 403, reason: `missing_${rule.permission}` };
  }
  return { allowed: true };
}

export function isLeadershipView(value: string): value is LeadershipView {
  return Object.prototype.hasOwnProperty.call(LEADERSHIP_VIEW_RULES, value);
}

export function isLeadershipAction(value: string): value is LeadershipAction {
  return Object.prototype.hasOwnProperty.call(LEADERSHIP_ACTION_RULES, value);
}

export function isParticipantAction(value: string): value is ParticipantAction {
  return Object.prototype.hasOwnProperty.call(PARTICIPANT_ACTION_RULES, value);
}

export type EngagementSectionId =
  | "overview"
  | "staff"
  | "departments"
  | "bark_outs"
  | "moderation"
  | "workload"
  | "analytics"
  | "development"
  | "programs"
  | "feedback"
  | "announcements"
  | "reports"
  | "audit"
  | "settings"
  | "management_access"
  | "admin_management"
  | "permissions"
  | "ai_policy"
  | "security"
  | "integrations"
  | "system_health"
  | "retention"
  | "features";

export type EngagementNavItem = {
  id: EngagementSectionId;
  label: string;
  icon: string;
  view: LeadershipView;
};

export type EngagementNavGroup = {
  id: string;
  label: string;
  items: EngagementNavItem[];
};

function item(id: EngagementSectionId, label: string, icon: string, view: LeadershipView = id as LeadershipView): EngagementNavItem {
  return { id, label, icon, view };
}

const MANAGEMENT_NAV: EngagementNavGroup[] = [
  {
    id: "team",
    label: "My teams",
    items: [
      item("overview", "Team Overview", "team-overview"),
      item("staff", "Staff Directory", "staff-directory"),
      item("bark_outs", "Bark Outs", "bark-outs"),
      item("moderation", "Moderation Queue", "moderation"),
      item("workload", "Workload Intelligence", "workload"),
      item("development", "Employee Development", "development"),
      item("feedback", "Team Feedback", "feedback"),
      item("announcements", "Announcements", "announcements"),
      item("programs", "Recognition Programs", "programs"),
      item("reports", "Team Reports", "analytics")
    ]
  }
];

const ADMIN_NAV: EngagementNavGroup[] = [
  {
    id: "organization",
    label: "Organization",
    items: [
      item("overview", "Organization Overview", "team-overview"),
      item("staff", "All Staff", "staff-directory"),
      item("departments", "Departments", "balance"),
      item("bark_outs", "Bark Outs", "bark-outs"),
      item("moderation", "Moderation Center", "moderation"),
      item("workload", "Workload Intelligence", "workload"),
      item("analytics", "Engagement Analytics", "analytics"),
      item("development", "Employee Development", "development"),
      item("programs", "Recognition Programs", "programs"),
      item("feedback", "Feedback & Suggestions", "feedback"),
      item("announcements", "Announcements", "announcements"),
      item("reports", "Reports & Exports", "export"),
      item("audit", "Audit History", "audit-log"),
      item("settings", "Engagement Settings", "settings")
    ]
  }
];

const SUPER_ADMIN_NAV: EngagementNavGroup[] = [
  {
    id: "global",
    label: "Global administration",
    items: [
      item("overview", "Global Overview", "team-overview"),
      item("departments", "Organization & Departments", "balance"),
      item("staff", "All Employees", "staff-directory"),
      item("management_access", "Management Access", "manager", "access"),
      item("admin_management", "Admin Management", "administrator", "access"),
      item("permissions", "Role & Permission Control", "permissions"),
      item("moderation", "Global Moderation", "moderation"),
      item("ai_policy", "AI Policy Configuration", "flag-review"),
      item("settings", "Engagement Configuration", "settings"),
      item("analytics", "Analytics & Reporting", "analytics"),
      item("audit", "Audit Logs", "audit-log"),
      item("security", "Security & Privacy", "privacy"),
      item("integrations", "Integrations", "more"),
      item("system_health", "System Health", "alert"),
      item("retention", "Data Retention", "calendar-shift"),
      item("features", "Feature Controls", "check")
    ]
  },
  {
    id: "workspace",
    label: "Engagement workspace",
    items: [
      item("bark_outs", "Bark Outs", "bark-outs"),
      item("workload", "Workload Intelligence", "workload"),
      item("development", "Employee Development", "development"),
      item("programs", "Recognition Programs", "programs"),
      item("feedback", "Feedback & Suggestions", "feedback"),
      item("announcements", "Announcements", "announcements"),
      item("reports", "Reports & Exports", "export")
    ]
  }
];

/** Distinct navigation per tier, trimmed to the sections this person's permissions allow. */
export function engagementNavigation(
  tier: TeamEngagementTier | null,
  permissions: readonly EngagementPermission[]
): EngagementNavGroup[] {
  if (!tier) return [];
  const base = tier === "super_admin" ? SUPER_ADMIN_NAV : tier === "admin" ? ADMIN_NAV : MANAGEMENT_NAV;
  return base
    .map((group) => ({
      ...group,
      items: group.items.filter((entry) => evaluateRule(LEADERSHIP_VIEW_RULES[entry.view], { tier, permissions }, { leadership: true }).allowed)
    }))
    .filter((group) => group.items.length > 0);
}

export function defaultEngagementSection(nav: EngagementNavGroup[]): EngagementSectionId | null {
  return nav[0]?.items[0]?.id ?? null;
}
