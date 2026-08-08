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
      p("manage_staff_whiteboard", "Manage Staff Whiteboard", "Publish and manage staff board content."),
      p("manage_lobby_board", "Manage Lobby Whiteboard", "Edit lobby messages, promotions, and class schedule.")
    ]
  },
  {
    key: "push_alerts",
    label: "Push & Alerts",
    permissions: [
      p("manage_push_notices", "Push Notices", "Create and send staff push notices."),
      p("manage_cast_videos", "Cast Videos", "Upload and push full-screen cast videos to displays."),
      p("push_grooming_request", "Grooming Push", "Send grooming push notices."),
      p("clear_grooming_request", "Clear Grooming Push", "Clear active grooming push notices."),
      p("push_trainer_request", "Trainer Push", "Send trainer push notices."),
      p("clear_trainer_request", "Clear Trainer Push", "Clear trainer push notices."),
      p("push_yard_notice", "Yard Camera Push", "Push yard camera feeds to the staff whiteboard."),
      p("receive_admin_alerts", "Receive Admin Alerts", "Receive high-priority management alerts."),
      p("receive_walks_board_reminders", "Receive Walks Board Reminders", "Receive walk-due reminders for tracked dogs.")
    ]
  },
  {
    key: "front_desk",
    label: "Team Log",
    permissions: [
      p("view_front_desk_log", "View Team Log", "View crossover / team log entries."),
      p("create_front_desk_log", "Create Log Entry", "Create new team log entries."),
      p("edit_front_desk_log", "Edit Log Entries", "Edit team log entries."),
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
      p("resolve_active_issue", "Resolve Active Issue", "Resolve active issues."),
      p("view_fitdog_alerts", "View Fitdog Alerts", "View Fitdog payment and operations alerts under Operations."),
      p("manage_fitdog_alerts", "Manage Fitdog Alerts", "Assign, resolve, and sync Fitdog payment alerts."),
      p("view_vip_auto_book", "View VIP Auto Book", "View VIP clients who always want Fitdog Sports bookings."),
      p("manage_vip_auto_book", "Manage VIP Auto Book", "Add, edit, and sync VIP Auto Book clients from app.fitdog.com.")
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
      p("submit_write_up", "Submit Write-Up Request", "Submit employee warning notices."),
      p("view_own_write_ups", "View Own Write-Ups", "View write-ups where the employee is the signed-in dog handler."),
      p("review_write_ups", "Review Write-Ups", "Review all submitted employee write-ups.")
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
    key: "applications",
    label: "Applications",
    permissions: [
      p("route_generator.view", "Route Generator: View", "View Route Generator plans and maps."),
      p("route_generator.pull_report", "Route Generator: Pull Report", "Pull Fitdog pickup/drop-off reports."),
      p("route_generator.generate", "Route Generator: Generate", "Generate and re-optimize routes."),
      p("route_generator.edit", "Route Generator: Edit", "Manually edit routes and overrides."),
      p("route_generator.approve", "Route Generator: Approve", "Approve route plans for export."),
      p("route_generator.export", "Route Generator: Export", "Export validated Samsara CSV files."),
      p("route_generator.manage_settings", "Route Generator: Manage Settings", "Manage vans, depot, integrations, and templates."),
      p("route_generator.view_audit", "Route Generator: View Audit", "View Route Generator audit events.")
    ]
  },
  {
    key: "hr_staff",
    label: "HR & Staff Directory",
    permissions: [
      p("view_staff_directory", "View Staff Directory", "View staff directory."),
      p("manage_staff_directory", "Manage Staff Directory", "Edit staff directory entries."),
      p("view_package_commissions", "View Package & Class Commissions", "View trainer package and class commissions."),
      p("comment_package_commissions", "Comment on Commissions", "Add comments or disputes to commission rows."),
      p("manage_package_commissions", "Manage Package & Class Commissions", "Add, confirm, and administer trainer commissions.")
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
  },
  {
    key: "ruffly",
    label: "Ruffly Customer Care",
    permissions: [
      p("ruffly.view", "View Ruffly", "Open the Ruffly workspace."),
      p("ruffly.dashboard.view", "Ruffly Overview", "View Ruffly executive dashboard metrics."),
      p("ruffly.inbox.view", "View Inbox", "View shared customer conversations."),
      p("ruffly.inbox.reply", "Reply in Inbox", "Send messages and internal notes."),
      p("ruffly.inbox.assign", "Assign Conversations", "Assign inbox conversations to staff."),
      p("ruffly.inbox.export", "Export Inbox", "Export conversation data."),
      p("ruffly.contacts.view", "View Contacts", "View Ruffly contact records."),
      p("ruffly.contacts.edit", "Edit Contacts", "Create and edit Ruffly contacts."),
      p("ruffly.leads.view", "View Leads", "View the lead pipeline."),
      p("ruffly.leads.edit", "Edit Leads", "Update lead stages and assignments."),
      p("ruffly.reviews.view", "View Reviews", "View review requests and reviews."),
      p("ruffly.reviews.respond", "Respond to Reviews", "Draft and manage review responses."),
      p("ruffly.reviews.publish", "Publish Review Responses", "Publish approved review responses."),
      p("ruffly.feedback.view", "View Feedback", "View private feedback."),
      p("ruffly.feedback.resolve", "Resolve Feedback", "Manage feedback workflows."),
      p("ruffly.campaigns.view", "View Campaigns", "View marketing campaigns."),
      p("ruffly.campaigns.create", "Create Campaigns", "Create campaign drafts."),
      p("ruffly.campaigns.approve", "Approve Campaigns", "Approve campaigns for send."),
      p("ruffly.campaigns.send", "Send Campaigns", "Send approved campaigns."),
      p("ruffly.automations.view", "View Automations", "View automation workflows."),
      p("ruffly.automations.manage", "Manage Automations", "Create and activate automations."),
      p("ruffly.webchat.manage", "Manage Web Chat", "Configure the Ruffly web chat widget."),
      p("ruffly.ai.manage", "Manage AI", "Configure AI assistant and receptionist."),
      p("ruffly.knowledge.manage", "Manage Knowledge Base", "Edit AI knowledge articles."),
      p("ruffly.social.view", "View Social", "View social content workspace."),
      p("ruffly.social.manage", "Manage Social", "Create and schedule social posts."),
      p("ruffly.analytics.view", "View Ruffly Analytics", "View Ruffly reports."),
      p("ruffly.integrations.manage", "Manage Ruffly Integrations", "Configure provider connections (Super Admin)."),
      p("ruffly.settings.manage", "Manage Ruffly Settings", "Configure Ruffly setup and channel activation."),
      p("ruffly.audit.view", "View Ruffly Audit Log", "View Ruffly audit history (Super Admin).")
    ]
  },
  {
    key: "automatic_blog",
    label: "Blog Generator",
    permissions: [
      p("blog.view", "View Blog Generator", "Open the Blog Generator workspace."),
      p("blog.submit_idea", "Submit Blog Ideas", "Submit topic ideas for review."),
      p("blog.create", "Create Blog Content", "Create topics, briefs, and drafts."),
      p("blog.edit", "Edit Blog Content", "Edit drafts and metadata."),
      p("blog.review", "Review Blog Content", "Run and review editorial checks."),
      p("blog.approve", "Approve Blog Articles", "Approve articles for scheduling."),
      p("blog.schedule", "Schedule Blog Articles", "Schedule approved articles."),
      p("blog.publish", "Publish Blog Articles", "Publish approved articles."),
      p("blog.archive", "Archive Blog Articles", "Archive blog content."),
      p("blog.delete", "Delete Blog Content", "Delete blog records (protected)."),
      p("blog.manage_sources", "Manage Blog Sources", "Manage research sources."),
      p("blog.manage_knowledge", "Manage Blog Knowledge", "Manage Fitdog knowledge entries."),
      p("blog.manage_media", "Manage Blog Media", "Upload and organize media."),
      p("blog.approve_images", "Approve Blog Images", "Approve images for publication."),
      p("blog.manage_brand", "Manage Blog Brand Voice", "Edit Fitdog brand voice settings."),
      p("blog.manage_providers", "Manage Blog AI Providers", "Configure AI providers (Super Admin)."),
      p("blog.manage_publishing", "Manage Blog Publishing", "Configure publishing destinations."),
      p("blog.manage_automation", "Manage Blog Automation", "Configure automation rules."),
      p("blog.view_costs", "View Blog Costs", "View AI usage and costs."),
      p("blog.view_analytics", "View Blog Analytics", "View verified blog analytics."),
      p("blog.view_audit_log", "View Blog Audit Log", "View Blog Generator audit history.")
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
