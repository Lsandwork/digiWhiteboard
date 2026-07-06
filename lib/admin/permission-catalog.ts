import {
  SUPER_ADMIN_ONLY_PERMISSIONS,
  type PermissionKey,
  type RoleKey
} from "@/lib/admin/permissions";

export { SUPER_ADMIN_ONLY_PERMISSIONS };

export type PermissionCatalogEntry = {
  key: PermissionKey;
  label: string;
  description: string;
};

export type PermissionCategory = {
  key: string;
  label: string;
  permissions: PermissionCatalogEntry[];
};

export const MATRIX_ROLE_KEYS: RoleKey[] = [
  "super_admin",
  "admin",
  "management",
  "team_leader",
  "front_desk_coordinator",
  "groomer",
  "trainer",
  "staff",
  "driver",
  "viewer"
];

export const MATRIX_ROLE_LABELS: Partial<Record<RoleKey, string>> = {
  super_admin: "Super Admin",
  admin: "Admin",
  management: "Assistant Manager",
  team_leader: "Team Leads",
  front_desk_coordinator: "Coordinator",
  groomer: "Groomer",
  trainer: "Trainer",
  staff: "Dog Handler / Staff",
  driver: "Driver",
  viewer: "Viewer"
};

function p(key: PermissionKey, label: string, description: string): PermissionCatalogEntry {
  return { key, label, description };
}

export const PERMISSION_CATEGORIES: PermissionCategory[] = [
  {
    key: "administration",
    label: "Administration",
    permissions: [
      p("view_admin_panel", "View Admin Panel", "Access the Fitdog admin dashboard."),
      p("manage_staff_users", "Manage Users", "Create, edit, and deactivate admin users."),
      p("reset_user_password", "Reset Passwords", "Reset passwords for other users."),
      p("force_password_change", "Force Password Change", "Require users to change password on next login."),
      p("view_user_groups_permissions", "View User Groups & Permissions", "Open the permissions matrix page."),
      p("manage_user_groups_permissions", "Manage User Groups & Permissions", "Edit role permission checkboxes.")
    ]
  },
  {
    key: "settings",
    label: "Settings",
    permissions: [
      p("manage_system_settings", "Edit System Settings", "Change global admin settings."),
      p("manage_gemini_settings", "Manage Gemini / AI Settings", "Configure Fitdog AI and HR consult models.")
    ]
  },
  {
    key: "integrations_api",
    label: "Integrations & API",
    permissions: [
      p("view_integrations", "View Integrations", "See the Integrations tab and connection status."),
      p("configure_integrations", "Manage Integrations", "Change integration configuration."),
      p("view_integration_status", "View Integration Status", "View sync health and integration details."),
      p("view_api_access", "View API Access", "View API keys and access settings."),
      p("manage_api_keys", "Manage API Keys", "Create or rotate API credentials."),
      p("view_gingr_sync_settings", "View Gingr Sync Settings", "View Gingr sync configuration."),
      p("manage_gingr_sync_settings", "Manage Gingr Sync Settings", "Change Gingr sync settings."),
      p("manage_database_tools", "Database Tools", "Access backup and database utilities.")
    ]
  },
  {
    key: "whiteboards",
    label: "Whiteboards",
    permissions: [
      p("view_staff_whiteboard", "View Staff Whiteboard", "Preview and view the staff digital whiteboard."),
      p("manage_staff_whiteboard", "Manage Staff Whiteboard", "Publish and manage staff board content.")
    ]
  },
  {
    key: "push_alerts",
    label: "Push & Alerts",
    permissions: [
      p("manage_push_notices", "Push Notices", "Create and send staff push notices."),
      p("push_grooming_request", "Grooming Push", "Send grooming push notices."),
      p("clear_grooming_request", "Clear Grooming Push", "Clear active grooming push notices."),
      p("push_trainer_request", "Trainer Push", "Send trainer push notices."),
      p("clear_trainer_request", "Clear Trainer Push", "Clear trainer push notices."),
      p("receive_admin_alerts", "Receive Admin Alerts", "Receive high-priority management alerts.")
    ]
  },
  {
    key: "front_desk",
    label: "Front Desk Log",
    permissions: [
      p("view_front_desk_log", "View Front Desk Log", "View crossover / front desk log entries."),
      p("create_front_desk_log", "Create Log Entry", "Create new front desk log entries."),
      p("edit_front_desk_log", "Edit Log Entries", "Edit front desk log entries."),
      p("assign_front_desk_log", "Assign Log Entries", "Assign logs to staff members."),
      p("resolve_front_desk_log", "Resolve Log Entries", "Mark log items resolved."),
      p("view_owner_follow_up", "View Owner Follow-Up", "View owner follow-up items."),
      p("create_owner_follow_up", "Create Owner Follow-Up", "Create owner follow-up records."),
      p("edit_owner_follow_up", "Edit Owner Follow-Up", "Edit owner follow-up records."),
      p("assign_owner_follow_up", "Assign Owner Follow-Up", "Assign owner follow-ups."),
      p("resolve_owner_follow_up", "Resolve Owner Follow-Up", "Resolve owner follow-ups."),
      p("view_active_issues", "View Active Issues", "View active issues list."),
      p("create_active_issue", "Create Active Issue", "Create new active issues."),
      p("edit_active_issue", "Edit Active Issue", "Edit active issues."),
      p("assign_active_issue", "Assign Active Issue", "Assign active issues."),
      p("resolve_active_issue", "Resolve Active Issue", "Resolve active issues.")
    ]
  },
  {
    key: "management_support",
    label: "Management Support",
    permissions: [
      p("review_management_support", "Review All Support Items", "Review all requests and complaints."),
      p("submit_groomer_complaint", "File Complaint (Groomer)", "Submit groomer complaints."),
      p("submit_groomer_request", "File Request (Groomer)", "Submit groomer requests."),
      p("view_own_groomer_submissions", "View Own Groomer Submissions", "View own groomer requests/complaints."),
      p("submit_trainer_complaint", "File Complaint (Trainer)", "Submit trainer complaints."),
      p("submit_trainer_request", "File Request (Trainer)", "Submit trainer requests."),
      p("view_own_trainer_submissions", "View Own Trainer Submissions", "View own trainer requests/complaints."),
      p("create_trainer_entry", "Create Trainer Entry", "Submit trainer shift log entries.")
    ]
  },
  {
    key: "write_ups",
    label: "Write-Ups",
    permissions: [
      p("submit_write_up", "Submit Write-Up Request", "Submit employee write-up requests."),
      p("view_own_write_ups", "View Own Write-Ups", "View own write-up submissions."),
      p("review_write_ups", "Review Write-Ups", "Review and respond to write-up requests.")
    ]
  },
  {
    key: "notifications",
    label: "Notifications",
    permissions: [
      p("view_notifications", "View Notifications", "Access the notifications inbox."),
      p("respond_to_notifications", "Respond to Notifications", "Reply to notification threads."),
      p("assign_notifications", "Assign Notifications", "Assign support notifications to staff."),
      p("view_internal_notes", "View Internal Notes", "See admin-only internal notes on threads."),
      p("create_internal_notes", "Create Internal Notes", "Add internal notes on support threads.")
    ]
  },
  {
    key: "templates_video",
    label: "Templates & Video Links",
    permissions: [
      p("manage_templates", "Manage Templates", "Edit board and log templates."),
      p("view_video_links", "View Video Links", "Access yard / video links."),
      p("manage_video_links", "Manage Video Links", "Create and edit video links.")
    ]
  },
  {
    key: "ai_tools",
    label: "Fitdog AI",
    permissions: [
      p("use_fitdog_ai", "Use Fitdog AI", "Open and use the Fitdog AI assistant."),
      p("use_hr_consult", "HR Consult", "Use HR consult with Gemini."),
      p("view_hr_hub", "View HR Hub", "Access the HR hub panel.")
    ]
  },
  {
    key: "hr_staff",
    label: "HR & Staff Directory",
    permissions: [
      p("view_staff_directory", "View Staff Directory", "View staff directory."),
      p("manage_staff_directory", "Manage Staff Directory", "Edit staff directory entries."),
      p("view_package_commissions", "View Package Commissions", "View trainer package commissions."),
      p("comment_package_commissions", "Comment on Commissions", "Add comments to commission rows."),
      p("manage_package_commissions", "Manage Package Commissions", "Administer package commissions.")
    ]
  },
  {
    key: "system_data",
    label: "System & Data",
    permissions: [
      p("view_analytics", "View Analytics", "Access analytics and reports."),
      p("export_reports", "Export Reports", "Export report data."),
      p("view_admin_logs", "View Logs", "View admin audit logs.")
    ]
  }
];

export const ALL_CATALOG_PERMISSION_KEYS: PermissionKey[] = [
  ...new Set(PERMISSION_CATEGORIES.flatMap((category) => category.permissions.map((item) => item.key)))
];

export function catalogEntryForKey(key: PermissionKey): PermissionCatalogEntry | null {
  for (const category of PERMISSION_CATEGORIES) {
    const found = category.permissions.find((item) => item.key === key);
    if (found) return found;
  }
  return null;
}
