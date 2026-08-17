/**
 * Centralized RBAC definitions for Fitdog Staff Digital Whiteboard Admin.
 * Roles grant permissions; users may hold multiple roles and departments.
 */

import type { AdminBoardType } from "@/lib/admin/types";
import { BLOG_SUITE_NAMED_PERMISSIONS, isBlogSuiteNamedUser } from "@/lib/admin/named-tool-access";

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
  | "view_track_incidents"
  | "manage_track_incidents"
  | "view_fitdog_alerts"
  | "manage_fitdog_alerts"
  | "view_vet_visits"
  | "manage_vet_visits"
  | "view_vip_auto_book"
  | "manage_vip_auto_book"
  | "route_generator.view"
  | "route_generator.pull_report"
  | "route_generator.generate"
  | "route_generator.edit"
  | "route_generator.approve"
  | "route_generator.export"
  | "route_generator.manage_settings"
  | "route_generator.view_audit"
  | "system_health.view"
  | "system_health.errors"
  | "system_health.integrations"
  | "system_health.route_audits"
  | "system_health.user_activity"
  | "system_health.developer"
  | "system_health.export"
  | "system_health.configure"
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
  | "view_admin_logs"
  | "view_my_shift"
  | "view_ops_command_center"
  | "view_ops_dog_profile"
  | "manage_ops_tasks"
  | "receive_walks_board_reminders"
  | "view_tl_digi_board"
  | "manage_tl_digi_board"
  | "manage_lobby_board"
  | "manage_cast_tv"
  | "manage_photo_upload_queue"
  | "download_photo_uploads"
  | "reopen_photo_upload_batches"
  | "manage_photo_upload_settings"
  | "ruffly.view"
  | "ruffly.dashboard.view"
  | "ruffly.inbox.view"
  | "ruffly.inbox.reply"
  | "ruffly.inbox.assign"
  | "ruffly.inbox.export"
  | "ruffly.contacts.view"
  | "ruffly.contacts.edit"
  | "ruffly.leads.view"
  | "ruffly.leads.edit"
  | "ruffly.reviews.view"
  | "ruffly.reviews.respond"
  | "ruffly.reviews.publish"
  | "ruffly.feedback.view"
  | "ruffly.feedback.resolve"
  | "ruffly.campaigns.view"
  | "ruffly.campaigns.create"
  | "ruffly.campaigns.approve"
  | "ruffly.campaigns.send"
  | "ruffly.automations.view"
  | "ruffly.automations.manage"
  | "ruffly.webchat.manage"
  | "ruffly.ai.manage"
  | "ruffly.knowledge.manage"
  | "ruffly.social.view"
  | "ruffly.social.manage"
  | "ruffly.analytics.view"
  | "ruffly.integrations.manage"
  | "ruffly.settings.manage"
  | "ruffly.audit.view"
  | "blog.view"
  | "blog.submit_idea"
  | "blog.create"
  | "blog.edit"
  | "blog.review"
  | "blog.approve"
  | "blog.schedule"
  | "blog.publish"
  | "blog.archive"
  | "blog.delete"
  | "blog.manage_sources"
  | "blog.manage_knowledge"
  | "blog.manage_media"
  | "blog.approve_images"
  | "blog.manage_brand"
  | "blog.manage_providers"
  | "blog.manage_publishing"
  | "blog.manage_automation"
  | "blog.view_costs"
  | "blog.view_analytics"
  | "blog.view_audit_log";

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
  | "marketing"
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
  daycare: "Dog Handler",
  trainer: "Trainer",
  driver: "Driver/Hiker",
  hiker: "Driver/Hiker",
  overnight: "Overnight",
  maintenance: "Maintenance",
  staff: "Staff",
  marketing: "Marketing Account",
  viewer: "Viewer"
};

export const DEPARTMENT_LABELS: Record<DepartmentKey, string> = {
  front_desk: "Front Desk",
  management: "Management",
  daycare: "Dog Handler",
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
  "view_track_incidents",
  "manage_track_incidents",
  "view_fitdog_alerts",
  "manage_fitdog_alerts",
  "view_vet_visits",
  "manage_vet_visits",
  "view_vip_auto_book",
  "manage_vip_auto_book",
  "route_generator.view",
  "route_generator.pull_report",
  "route_generator.generate",
  "route_generator.edit",
  "route_generator.approve",
  "route_generator.export",
  "route_generator.manage_settings",
  "route_generator.view_audit",
  "system_health.view",
  "system_health.errors",
  "system_health.integrations",
  "system_health.route_audits",
  "system_health.user_activity",
  "system_health.developer",
  "system_health.export",
  "system_health.configure",
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
  "view_admin_logs",
  "view_my_shift",
  "view_ops_command_center",
  "view_ops_dog_profile",
  "manage_ops_tasks",
  "receive_walks_board_reminders",
  "view_tl_digi_board",
  "manage_tl_digi_board",
  "manage_lobby_board",
  "manage_cast_tv",
  "manage_photo_upload_queue",
  "download_photo_uploads",
  "reopen_photo_upload_batches",
  "manage_photo_upload_settings",
  "ruffly.view",
  "ruffly.dashboard.view",
  "ruffly.inbox.view",
  "ruffly.inbox.reply",
  "ruffly.inbox.assign",
  "ruffly.inbox.export",
  "ruffly.contacts.view",
  "ruffly.contacts.edit",
  "ruffly.leads.view",
  "ruffly.leads.edit",
  "ruffly.reviews.view",
  "ruffly.reviews.respond",
  "ruffly.reviews.publish",
  "ruffly.feedback.view",
  "ruffly.feedback.resolve",
  "ruffly.campaigns.view",
  "ruffly.campaigns.create",
  "ruffly.campaigns.approve",
  "ruffly.campaigns.send",
  "ruffly.automations.view",
  "ruffly.automations.manage",
  "ruffly.webchat.manage",
  "ruffly.ai.manage",
  "ruffly.knowledge.manage",
  "ruffly.social.view",
  "ruffly.social.manage",
  "ruffly.analytics.view",
  "ruffly.integrations.manage",
  "ruffly.settings.manage",
  "ruffly.audit.view",
  "blog.view",
  "blog.submit_idea",
  "blog.create",
  "blog.edit",
  "blog.review",
  "blog.approve",
  "blog.schedule",
  "blog.publish",
  "blog.archive",
  "blog.delete",
  "blog.manage_sources",
  "blog.manage_knowledge",
  "blog.manage_media",
  "blog.approve_images",
  "blog.manage_brand",
  "blog.manage_providers",
  "blog.manage_publishing",
  "blog.manage_automation",
  "blog.view_costs",
  "blog.view_analytics",
  "blog.view_audit_log"
] as const satisfies readonly PermissionKey[]);

/** Permissions reserved for Super Admin — Admin cannot receive these by default. */
export const SUPER_ADMIN_ONLY_PERMISSIONS = new Set<PermissionKey>([
  "view_user_groups_permissions",
  "manage_user_groups_permissions",
  "view_integrations",
  "configure_integrations",
  "view_integration_status",
  "view_api_access",
  "ruffly.integrations.manage",
  "ruffly.audit.view",
  "blog.manage_providers",
  "blog.manage_publishing",
  "blog.manage_automation",
  "blog.delete",
  "manage_api_keys",
  "view_gingr_sync_settings",
  "manage_gingr_sync_settings",
  "manage_gemini_settings",
  "manage_database_tools",
  "reopen_photo_upload_batches",
  "manage_photo_upload_settings",
  "system_health.developer",
  "system_health.configure"
]);

/** Staff file complaints/requests; admin and management review (and may also submit write-ups). */
const STAFF_SUBMISSION_PERMISSIONS = new Set<PermissionKey>([
  "submit_groomer_complaint",
  "submit_groomer_request",
  "submit_trainer_complaint",
  "submit_trainer_request"
]);

function withoutStaffSubmissions(permissions: PermissionKey[]): PermissionKey[] {
  return permissions.filter((permission) => !STAFF_SUBMISSION_PERMISSIONS.has(permission));
}

const ADMIN_OPERATIONAL_PERMISSIONS: PermissionKey[] = withoutStaffSubmissions(
  ALL_PERMISSIONS.filter((permission) => !SUPER_ADMIN_ONLY_PERMISSIONS.has(permission))
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
  "manage_photo_upload_queue",
  "download_photo_uploads",
  "view_staff_directory",
  "submit_groomer_complaint",
  "submit_groomer_request",
  "view_own_groomer_submissions",
  "view_fitdog_alerts",
  "manage_fitdog_alerts",
  "view_vip_auto_book",
  "manage_vip_auto_book",
  ...STAFF_NOTIFICATION_PERMISSIONS,
  ...STAFF_VIDEO_AI_PERMISSIONS,
  "ruffly.view",
  "ruffly.dashboard.view",
  "ruffly.inbox.view",
  "ruffly.inbox.reply",
  "ruffly.contacts.view",
  "ruffly.contacts.edit",
  "ruffly.leads.view",
  "ruffly.leads.edit",
  "ruffly.reviews.view",
  "view_my_shift",
  "view_ops_command_center",
  "view_ops_dog_profile",
  "manage_ops_tasks",
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
  "create_owner_follow_up",
  "edit_owner_follow_up",
  "assign_owner_follow_up",
  "resolve_owner_follow_up",
  "view_active_issues",
  "assign_active_issue",
  "resolve_active_issue",
  "view_staff_directory",
  "receive_admin_alerts",
  "receive_walks_board_reminders",
  "review_management_support",
  "review_write_ups",
  "submit_write_up",
  "view_package_commissions",
  "manage_package_commissions",
  "view_track_incidents",
  "manage_track_incidents",
  "view_fitdog_alerts",
  "manage_fitdog_alerts",
  "view_vet_visits",
  "manage_vet_visits",
  "view_vip_auto_book",
  "manage_vip_auto_book",
  "route_generator.view",
  "route_generator.pull_report",
  "route_generator.generate",
  "route_generator.edit",
  "route_generator.approve",
  "route_generator.export",
  "route_generator.view_audit",
  "system_health.view",
  "system_health.errors",
  "system_health.integrations",
  "system_health.route_audits",
  "system_health.user_activity",
  "system_health.export",
  "view_hr_hub",
  "use_hr_consult",
  "view_analytics",
  "export_reports",
  "manage_photo_upload_queue",
  "download_photo_uploads",
  ...STAFF_NOTIFICATION_PERMISSIONS,
  "assign_notifications",
  "view_internal_notes",
  "create_internal_notes",
  ...STAFF_VIDEO_AI_PERMISSIONS,
  "ruffly.view",
  "ruffly.dashboard.view",
  "ruffly.inbox.view",
  "ruffly.inbox.reply",
  "ruffly.inbox.assign",
  "ruffly.contacts.view",
  "ruffly.contacts.edit",
  "ruffly.leads.view",
  "ruffly.leads.edit",
  "ruffly.reviews.view",
  "ruffly.reviews.respond",
  "ruffly.feedback.view",
  "ruffly.feedback.resolve",
  "ruffly.campaigns.view",
  "ruffly.analytics.view",
  "ruffly.ai.manage",
  "view_my_shift",
  "view_ops_command_center",
  "view_ops_dog_profile",
  "manage_ops_tasks",
];

/** Trainer DigiBoard panel — trainer push, shift log entry, video links, notifications, complaints/requests/commissions, profile. */
const TRAINER_PERMISSIONS: PermissionKey[] = [
  "view_admin_panel",
  "view_staff_whiteboard",
  "view_front_desk_log",
  "create_front_desk_log",
  "edit_front_desk_log",
  "push_trainer_request",
  "clear_trainer_request",
  "create_trainer_entry",
  "submit_trainer_complaint",
  "submit_trainer_request",
  "view_own_trainer_submissions",
  "view_package_commissions",
  "comment_package_commissions",
  "manage_photo_upload_queue",
  ...STAFF_NOTIFICATION_PERMISSIONS,
  ...STAFF_VIDEO_AI_PERMISSIONS,
  "ruffly.view",
  "ruffly.inbox.view",
  "ruffly.inbox.reply",
  "ruffly.contacts.view",
  "ruffly.leads.view",
  "view_my_shift",
  "view_ops_dog_profile",
];

/** Groomer DigiBoard panel — grooming push, team log, video links, notifications, complaints/requests, profile. */
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
  "manage_photo_upload_queue",
  ...STAFF_NOTIFICATION_PERMISSIONS,
  ...STAFF_VIDEO_AI_PERMISSIONS,
  "ruffly.view",
  "ruffly.inbox.view",
  "ruffly.inbox.reply",
  "ruffly.leads.view",
  "view_my_shift",
  "view_ops_dog_profile",
];

/** Read-only staff roles (viewer / overnight / maintenance / generic staff). */
const STAFF_VIEWER_PERMISSIONS: PermissionKey[] = [
  "view_admin_panel",
  "view_staff_whiteboard",
  "view_front_desk_log",
  "manage_photo_upload_queue",
  ...STAFF_NOTIFICATION_PERMISSIONS,
  ...STAFF_VIDEO_AI_PERMISSIONS,
  "view_my_shift",
];

/** Lobby marketing panel — lobby content plus Team Log landing access. */
const MARKETING_PERMISSIONS: PermissionKey[] = [
  "view_admin_panel",
  "manage_lobby_board",
  "manage_cast_tv",
  "view_staff_whiteboard",
  "view_front_desk_log",
  "create_front_desk_log",
  "manage_photo_upload_queue",
  "ruffly.view",
  "ruffly.dashboard.view",
  "ruffly.campaigns.view",
  "ruffly.campaigns.create",
  "ruffly.campaigns.approve",
  "ruffly.campaigns.send",
  "ruffly.reviews.view",
  "ruffly.reviews.respond",
  "ruffly.social.view",
  "ruffly.social.manage",
  "ruffly.analytics.view",
  "ruffly.webchat.manage",
  "ruffly.contacts.view",
  "blog.view",
  "blog.submit_idea",
  "blog.create",
  "blog.edit",
  "blog.review",
  "blog.approve",
  "blog.schedule",
  "blog.publish",
  "blog.archive",
  "blog.manage_sources",
  "blog.manage_media",
  "blog.approve_images",
  "blog.manage_brand",
  "blog.view_analytics",
  "view_my_shift",
];

/** Transportation / Driver-Hiker Route Generator operations (no settings). */
const TRANSPORTATION_ROUTE_PERMISSIONS: PermissionKey[] = [
  "route_generator.view",
  "route_generator.pull_report",
  "route_generator.generate",
  "route_generator.edit",
  "route_generator.approve",
  "route_generator.export",
  "route_generator.view_audit"
];

/** Dog Handler panel — checklist, support, uploads, shift entry; view write-ups about them only. */
const DOG_HANDLER_PERMISSIONS: PermissionKey[] = [
  "view_admin_panel",
  "view_front_desk_log",
  "create_front_desk_log",
  "edit_front_desk_log",
  "submit_groomer_complaint",
  "submit_groomer_request",
  "view_own_groomer_submissions",
  "view_own_write_ups",
  "create_trainer_entry",
  "manage_photo_upload_queue",
  ...STAFF_NOTIFICATION_PERMISSIONS,
  "view_my_shift",
  "view_ops_dog_profile",
];

/** Team Lead DigiBoard panel — push, grooming, team log, video links, notifications, write-ups, profile. */
const TEAM_LEADER_PERMISSIONS: PermissionKey[] = [
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
  "submit_write_up",
  "submit_groomer_complaint",
  "view_own_groomer_submissions",
  "receive_walks_board_reminders",
  "manage_photo_upload_queue",
  "download_photo_uploads",
  ...STAFF_NOTIFICATION_PERMISSIONS,
  ...STAFF_VIDEO_AI_PERMISSIONS,
  "ruffly.view",
  "ruffly.dashboard.view",
  "ruffly.inbox.view",
  "ruffly.inbox.reply",
  "ruffly.inbox.assign",
  "ruffly.contacts.view",
  "ruffly.leads.view",
  "ruffly.leads.edit",
  "ruffly.feedback.view",
  "view_my_shift",
  "view_ops_dog_profile",
  "manage_ops_tasks",
  "view_ops_command_center",
];

export const FRONT_DESK_COORDINATOR_TABS = [
  "my_shift",
  "front_desk_command",
  "ops_command_center",
  "shift_handoff",
  "crossover_communication",
  "push_notices",
  "yard_push_notices",
  "grooming_push",
  "owner_follow_up",
  "active_issues",
  "fitdog_alerts",
  "vip_auto_book",
  "staff_directory",
  "bulk_photo_upload",
  "media_library",
  "yard_links",
  "walks_board",
  "notifications",
  "management_support",
  "settings",
  "help"
] as const;

export const TEAM_LEADER_TABS = [
  "my_shift",
  "yard_command",
  "ops_command_center",
  "shift_handoff",
  "crossover_communication",
  "push_notices",
  "yard_push_notices",
  "grooming_push",
  "owner_follow_up",
  "active_issues",
  "whiteboard_preview",
  "bulk_photo_upload",
  "media_library",
  "yard_links",
  "walks_board",
  "notifications",
  "management_support",
  "settings",
  "help"
] as const;

export const GROOMER_TABS = [
  "my_shift",
  "crossover_communication",
  "grooming_push",
  "whiteboard_preview",
  "bulk_photo_upload",
  "yard_links",
  "walks_board",
  "notifications",
  "management_support",
  "settings",
  "help"
] as const;

export const TRAINER_TABS = [
  "my_shift",
  "trainer_ops",
  "crossover_communication",
  "trainer_push",
  "package_commissions",
  "bulk_photo_upload",
  "yard_links",
  "walks_board",
  "notifications",
  "management_support",
  "settings",
  "help"
] as const;

export const DOG_HANDLER_TABS = [
  "my_shift",
  "driver_mode",
  "crossover_communication",
  "checklist",
  "walks_board",
  "notifications",
  "management_support",
  "bulk_photo_upload",
  "media_library",
  "write_ups",
  "settings",
  "help"
] as const;

export const MARKETING_TABS = [
  "content",
  "promotions",
  "schedule",
  "lobby_slideshow",
  "bulk_photo_upload",
  "media_library",
  "whiteboard_preview",
  "settings",
  "help"
] as const;

/** CAST-TV digital signage board — upload and manage casttv.ruffops.com playlist. */
export const MARKETING_BOARD_TABS = ["cast_tv", "sa_apps_hub", "bulk_photo_upload", "settings", "help"] as const;

export const ROLE_PERMISSIONS: Record<RoleKey, PermissionKey[]> = {
  super_admin: withoutStaffSubmissions([...ALL_PERMISSIONS]),
  admin: [...ADMIN_OPERATIONAL_PERMISSIONS],
  management: [...MANAGEMENT_PERMISSIONS],
  front_desk_coordinator: COORDINATOR_PERMISSIONS,
  team_leader: TEAM_LEADER_PERMISSIONS,
  groomer: GROOMER_PERMISSIONS,
  trainer: TRAINER_PERMISSIONS,
  daycare: DOG_HANDLER_PERMISSIONS,
  driver: [...DOG_HANDLER_PERMISSIONS, ...TRANSPORTATION_ROUTE_PERMISSIONS],
  hiker: [...DOG_HANDLER_PERMISSIONS, ...TRANSPORTATION_ROUTE_PERMISSIONS],
  overnight: STAFF_VIEWER_PERMISSIONS,
  maintenance: STAFF_VIEWER_PERMISSIONS,
  staff: STAFF_VIEWER_PERMISSIONS,
  marketing: MARKETING_PERMISSIONS,
  viewer: STAFF_VIEWER_PERMISSIONS
};

/** Map legacy admin_users.role values to RBAC role keys. */
export function legacyRoleToRoleKey(role?: string | null): RoleKey {
  switch (role) {
    case "owner_admin":
      return "super_admin";
    case "manager_admin":
      return "admin";
    case "assistant_manager":
    case "management":
      return "management";
    case "daycare":
    case "dog_handler":
      return "daycare";
    case "driver":
      return "driver";
    case "hiker":
      return "hiker";
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
    case "marketing":
      return "marketing";
    case "viewer":
      return "viewer";
    case "overnight":
      return "overnight";
    case "maintenance":
      return "maintenance";
    case "staff":
      return "staff";
    default:
      // Unknown / unmapped roles must not elevate to admin.
      return "viewer";
  }
}

/** Map RBAC primary role back to legacy admin_users.role for DB storage. */
export function roleKeyToLegacyRole(role: RoleKey): string {
  switch (role) {
    case "super_admin":
      return "owner_admin";
    case "admin":
      return "manager_admin";
    case "management":
      return "assistant_manager";
    case "daycare":
      return "daycare";
    case "driver":
      return "driver";
    case "hiker":
      return "hiker";
    case "front_desk_coordinator":
      return "front_desk_coordinator";
    case "team_leader":
      return "team_leader";
    case "groomer":
      return "groomer";
    case "trainer":
      return "trainer";
    case "marketing":
      return "marketing";
    case "overnight":
      return "overnight";
    case "maintenance":
      return "maintenance";
    case "staff":
      return "staff";
    case "viewer":
      return "viewer";
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
  name?: string | null;
  primaryRole: RoleKey;
  roles?: RoleKey[];
  departments?: DepartmentKey[];
  permissions?: PermissionKey[];
}): UserAccess {
  const roles = [...new Set([input.primaryRole, ...(input.roles ?? [])])];
  const departments = input.departments ?? [];
  let permissions = input.permissions ?? permissionsForRoles(roles);
  if (isBlogSuiteNamedUser({ email: input.email, name: input.name })) {
    permissions = [...new Set([...permissions, ...(BLOG_SUITE_NAMED_PERMISSIONS as readonly PermissionKey[])])];
  }
  return {
    userId: input.userId ?? null,
    email: input.email ?? null,
    primaryRole: input.primaryRole,
    roles,
    departments,
    permissions,
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
  checklist: "view_admin_panel",
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
  track_incidents: "view_track_incidents",
  fitdog_alerts: "view_fitdog_alerts",
  vet_visits: "view_vet_visits",
  vip_auto_book: "view_vip_auto_book",
  route_generator: "route_generator.view",
  live_fleet: "route_generator.view",
  my_shift: "view_my_shift",
  ops_command_center: "view_ops_command_center",
  front_desk_command: "view_my_shift",
  yard_command: "view_my_shift",
  driver_mode: "view_my_shift",
  overnight_command: "view_my_shift",
  trainer_ops: "view_my_shift",
  ops_system_health: "system_health.view",
  shift_handoff: "view_my_shift",
  sa_floor_hub: "view_admin_panel",
  sa_whiteboard_hub: "view_admin_panel",
  sa_people_hub: "view_admin_panel",
  sa_apps_hub: "view_admin_panel",
  sa_admin_hub: "view_admin_panel",
  ms_hub: "review_management_support",
  ms_groomer_complaints: "review_management_support",
  ms_groomer_requests: "review_management_support",
  ms_trainer_complaints: "review_management_support",
  ms_trainer_requests: "review_management_support",
  admin_trainer_entries: "review_management_support",
  hr_hub: "view_hr_hub",
  hr_consult: "use_hr_consult",
  bulk_photo_upload: "manage_photo_upload_queue",
  media_library: "manage_photo_upload_queue",
  write_ups: "submit_write_up",
  write_up_review: "review_write_ups",
  complaint_review: "review_management_support",
  handler_shift_entry: "create_trainer_entry",
  hr_pip: "view_hr_hub",
  walks_board: "view_admin_panel",
  tl_digi_board: "manage_tl_digi_board",
  settings: "view_admin_panel",
  help: "view_admin_panel",
  lobby_slideshow: "manage_lobby_board",
  cast_tv: "manage_cast_tv"
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
  view_front_desk_log: "Team Log",
  view_owner_follow_up: "Owner Follow Up",
  view_active_issues: "Active Issues",
  push_grooming_request: "Grooming Requests",
  view_staff_whiteboard: "Whiteboard Preview",
  view_staff_directory: "Staff Directory",
  view_integration_status: "Integrations Status",
  manage_templates: "Templates",
  receive_admin_alerts: "Management Alerts",
  "route_generator.view": "Route Generator / Live Fleet"
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

/** Owner Admin and Manager Admin — full sidebar and utilities (matches middleware / API guards). */
export function isFullAdminLegacyRole(legacyRole?: string | null) {
  // Missing/blank roles must never elevate to full admin.
  return legacyRole === "owner_admin" || legacyRole === "manager_admin";
}

/** Owner Admin, Manager Admin, or Assistant Manager. */
export function isAdminOrManagementLegacyRole(legacyRole?: string | null) {
  return isFullAdminLegacyRole(legacyRole) || legacyRole === "assistant_manager";
}

export function isSuperAdminAccess(access: UserAccess | null | undefined) {
  return hasRole(access, "super_admin");
}

/** Super Admin accounts always retain every staff push notice capability. */
export function hasSuperAdminPushAccess(access: UserAccess | null | undefined, legacyRole?: string | null) {
  return isSuperAdminLegacyRole(legacyRole) || isSuperAdminAccess(access);
}

export function canUseGroomingPush(access: UserAccess | null | undefined, legacyRole?: string | null) {
  if (hasSuperAdminPushAccess(access, legacyRole) || isFullAdminLegacyRole(legacyRole)) return true;
  if (hasPermission(access, "push_grooming_request")) return true;
  return (
    legacyRole === "front_desk_coordinator" ||
    legacyRole === "team_leader" ||
    legacyRole === "groomer"
  );
}

export function canClearGroomingPush(access: UserAccess | null | undefined, legacyRole?: string | null) {
  if (hasSuperAdminPushAccess(access, legacyRole) || isFullAdminLegacyRole(legacyRole)) return true;
  if (hasPermission(access, "clear_grooming_request")) return true;
  return canUseGroomingPush(access, legacyRole);
}

export function canUseTrainerPush(access: UserAccess | null | undefined, legacyRole?: string | null) {
  if (hasSuperAdminPushAccess(access, legacyRole) || isFullAdminLegacyRole(legacyRole)) return true;
  if (hasPermission(access, "push_trainer_request")) return true;
  return legacyRole === "trainer";
}

export function canClearTrainerPush(access: UserAccess | null | undefined, legacyRole?: string | null) {
  if (hasSuperAdminPushAccess(access, legacyRole) || isFullAdminLegacyRole(legacyRole)) return true;
  if (hasPermission(access, "clear_trainer_request")) return true;
  return canUseTrainerPush(access, legacyRole);
}

export function canUseStandardOrEmergencyPush(access: UserAccess | null | undefined, legacyRole?: string | null) {
  if (hasSuperAdminPushAccess(access, legacyRole) || isFullAdminLegacyRole(legacyRole)) return true;
  if (hasPermission(access, "manage_push_notices")) return true;
  return legacyRole === "front_desk_coordinator" || legacyRole === "team_leader";
}

export function canUseYardPush(access: UserAccess | null | undefined, legacyRole?: string | null) {
  if (hasSuperAdminPushAccess(access, legacyRole) || isFullAdminLegacyRole(legacyRole)) return true;
  if (hasPermission(access, "push_yard_notice")) return true;
  return (
    legacyRole === "assistant_manager" ||
    legacyRole === "front_desk_coordinator" ||
    legacyRole === "team_leader"
  );
}

export function canManageCastVideoPush(access: UserAccess | null | undefined, legacyRole?: string | null) {
  if (hasSuperAdminPushAccess(access, legacyRole) || isFullAdminLegacyRole(legacyRole)) return true;
  return hasPermission(access, "manage_cast_videos");
}

/** Super Admin accounts always retain HR hub and write-up capabilities. */
export function hasSuperAdminHrAccess(access: UserAccess | null | undefined, legacyRole?: string | null) {
  return isSuperAdminLegacyRole(legacyRole) || isSuperAdminAccess(access);
}

export function canAccessHrPanelsForUser(access: UserAccess | null | undefined, legacyRole?: string | null) {
  if (hasSuperAdminHrAccess(access, legacyRole) || isAdminOrManagementLegacyRole(legacyRole)) return true;
  if (hasPermission(access, "view_hr_hub")) return true;
  return hasAnyRole(access, ["admin", "management"]);
}

export function canSubmitWriteUpForUser(access: UserAccess | null | undefined, legacyRole?: string | null) {
  if (hasSuperAdminHrAccess(access, legacyRole) || isAdminOrManagementLegacyRole(legacyRole)) return true;
  if (hasPermission(access, "submit_write_up")) return true;
  return legacyRole === "team_leader";
}

export function canReviewWriteUpsForUser(access: UserAccess | null | undefined, legacyRole?: string | null) {
  if (hasSuperAdminHrAccess(access, legacyRole) || isAdminOrManagementLegacyRole(legacyRole)) return true;
  return hasPermission(access, "review_write_ups");
}

export function canViewOwnWriteUpsForUser(access: UserAccess | null | undefined, legacyRole?: string | null) {
  if (hasPermission(access, "view_own_write_ups")) return true;
  return isDogHandlerLegacyRole(legacyRole);
}

export function canReviewManagementSupportForUser(access: UserAccess | null | undefined, legacyRole?: string | null) {
  if (hasSuperAdminHrAccess(access, legacyRole) || isAdminOrManagementLegacyRole(legacyRole)) return true;
  if (hasPermission(access, "review_management_support")) return true;
  return hasAnyRole(access, ["admin", "management"]);
}

export function canManageSuperAdminUsers(actorAccess: UserAccess | null, actorLegacyRole?: string | null) {
  return isSuperAdminAccess(actorAccess) || isSuperAdminLegacyRole(actorLegacyRole);
}

export function isFrontDeskCoordinatorLegacyRole(legacyRole?: string | null) {
  return legacyRole === "front_desk_coordinator";
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

export function isMarketingLegacyRole(legacyRole?: string | null) {
  return legacyRole === "marketing";
}

const ROUTE_GENERATOR_ROLE_KEYS: RoleKey[] = ["super_admin", "admin", "management", "driver", "hiker"];

/** Live Fleet viewers — includes Front Desk Coordinators (Route Generator stays transportation-only). */
const LIVE_FLEET_ROLE_KEYS: RoleKey[] = [
  "super_admin",
  "admin",
  "management",
  "front_desk_coordinator",
  "driver",
  "hiker"
];

/**
 * Route Generator — Super Admin, Admin, Management, and Transportation only.
 * Transportation = Driver/Hiker login or the Transportation department checkbox.
 */
export function canAccessRouteGenerator(
  access?: UserAccess | null,
  legacyRole?: string | null
): boolean {
  if (
    isFullAdminLegacyRole(legacyRole) ||
    legacyRole === "assistant_manager" ||
    legacyRole === "management" ||
    legacyRole === "driver" ||
    legacyRole === "hiker"
  ) {
    return true;
  }
  if (isSuperAdminAccess(access) || hasAnyRole(access, ROUTE_GENERATOR_ROLE_KEYS)) {
    return true;
  }
  if (access?.departments.includes("transportation")) return true;
  const roleKey = legacyRoleToRoleKey(legacyRole);
  return ROUTE_GENERATOR_ROLE_KEYS.includes(roleKey);
}

/**
 * Live Fleet — Admin, Management, Front Desk Coordinators, and Transportation.
 * Broader than Route Generator so ops staff can monitor vans without generating routes.
 */
export function canAccessLiveFleet(
  access?: UserAccess | null,
  legacyRole?: string | null
): boolean {
  if (canAccessRouteGenerator(access, legacyRole)) return true;
  if (
    isFrontDeskCoordinatorLegacyRole(legacyRole) ||
    legacyRole === "front_desk_coordinator" ||
    legacyRole === "front_desk"
  ) {
    return true;
  }
  if (hasAnyRole(access, LIVE_FLEET_ROLE_KEYS)) return true;
  const roleKey = legacyRoleToRoleKey(legacyRole);
  return LIVE_FLEET_ROLE_KEYS.includes(roleKey);
}

/**
 * Blog Generator access — Super Admin, Admin, and Marketing only.
 * Checks legacy session role and RBAC role keys.
 */
export function canAccessBlogGenerator(
  access?: UserAccess | null,
  legacyRole?: string | null,
  email?: string | null,
  name?: string | null
): boolean {
  if (isBlogSuiteNamedUser({ email: email ?? access?.email, name })) return true;
  if (
    legacyRole === "owner_admin" ||
    legacyRole === "manager_admin" ||
    legacyRole === "marketing" ||
    isMarketingLegacyRole(legacyRole)
  ) {
    return true;
  }
  if (isSuperAdminAccess(access) || hasAnyRole(access, ["super_admin", "admin", "marketing"])) {
    return true;
  }
  return false;
}

/** Dog Handler + Driver/Hiker — same staff Digi-board pages and permissions. */
export function isDogHandlerLegacyRole(legacyRole?: string | null) {
  return (
    legacyRole === "daycare" ||
    legacyRole === "dog_handler" ||
    legacyRole === "driver" ||
    legacyRole === "hiker"
  );
}

/** Staff DigiBoard roles — staff board only (not lobby admin). */
export function isStaffDigiBoardOnlyLegacyRole(legacyRole?: string | null) {
  return (
    isTeamLeaderLegacyRole(legacyRole) ||
    isGroomerLegacyRole(legacyRole) ||
    isTrainerLegacyRole(legacyRole) ||
    isDogHandlerLegacyRole(legacyRole) ||
    isFrontDeskCoordinatorLegacyRole(legacyRole)
  );
}

/** Marketing accounts — lobby whiteboard admin only (not staff board). */
export function isLobbyDigiBoardOnlyLegacyRole(legacyRole?: string | null) {
  return isMarketingLegacyRole(legacyRole);
}

/** Boards the signed-in user may select in the admin board switcher. */
export function accessibleAdminBoards(
  access: UserAccess | null | undefined,
  legacyRole?: string | null
): AdminBoardType[] {
  if (isFullAdminLegacyRole(legacyRole) || isSuperAdminAccess(access)) {
    return ["lobby", "staff", "marketing"];
  }

  if (isMarketingLegacyRole(legacyRole)) {
    return ["staff", "lobby", "marketing"];
  }

  if (isStaffDigiBoardOnlyLegacyRole(legacyRole)) {
    return ["staff"];
  }

  const boards: AdminBoardType[] = ["staff", "lobby"];
  if (hasPermission(access, "manage_cast_tv")) {
    boards.push("marketing");
  }
  return boards;
}

export function canAccessAdminBoard(
  board: AdminBoardType,
  access: UserAccess | null | undefined,
  legacyRole?: string | null
): boolean {
  return accessibleAdminBoards(access, legacyRole).includes(board);
}

export function canUseAdminBoardSwitcher(
  access: UserAccess | null | undefined,
  legacyRole?: string | null
): boolean {
  return accessibleAdminBoards(access, legacyRole).length > 1;
}

export function canAccessAdminTab(
  access: UserAccess | null | undefined,
  tab: string,
  legacyRole?: string | null,
  board: AdminBoardType = "lobby",
  options?: { isDemo?: boolean }
): boolean {
  if (tab === "demo_push") return options?.isDemo === true && board === "staff";

  // Retired entry tools — deny before the full-admin early return so they leave admin/management nav.
  if (tab === "trainer_entry" || tab === "handler_shift_entry") {
    return false;
  }

  // Route Generator / Live Fleet are staff-board only — check before the full-admin early return
  // so lobby/marketing never treat the tab as accessible (which made nav clicks look dead).
  if (tab === "route_generator") {
    if (board !== "staff") return false;
    return canAccessRouteGenerator(access, legacyRole);
  }
  if (tab === "live_fleet") {
    if (board !== "staff") return false;
    return canAccessLiveFleet(access, legacyRole);
  }

  // Bulk Photo Upload is on every signed-in panel (staff + CAST-TV / marketing).
  if (tab === "bulk_photo_upload" && board !== "lobby") {
    const effective = access ?? accessFromLegacyRole(null, null, legacyRole);
    return (
      hasPermission(effective, "view_admin_panel") ||
      hasPermission(effective, "manage_photo_upload_queue") ||
      Boolean(legacyRole)
    );
  }

  // Same staff-board gate as Route Generator for walks / checklist / Fitdog alerts.
  if (tab === "walks_board") {
    if (board !== "staff") return false;
    if (isFullAdminLegacyRole(legacyRole) || isSuperAdminAccess(access)) return true;
    if (isMarketingLegacyRole(legacyRole)) return false;
    return true;
  }

  // TL Digi Board admin config — Owner Admin / Manager Admin (full admin) only.
  // Team Lead, Management (assistant_manager), Front Desk, trainers, etc. must not open this tab.
  if (tab === "tl_digi_board") {
    if (board !== "staff") return false;
    if (isFullAdminLegacyRole(legacyRole) || isSuperAdminAccess(access)) return true;
    return false;
  }

  if (tab === "checklist") {
    if (board !== "staff") return false;
    if (isFullAdminLegacyRole(legacyRole) || isSuperAdminAccess(access)) return true;
    if (isAdminOrManagementLegacyRole(legacyRole) || isTeamLeaderLegacyRole(legacyRole)) return true;
    return isDogHandlerLegacyRole(legacyRole);
  }

  if (tab === "fitdog_alerts") {
    if (board !== "staff") return false;
    if (isFullAdminLegacyRole(legacyRole) || isSuperAdminAccess(access)) return true;
    const effective = access ?? accessFromLegacyRole(null, null, legacyRole);
    if (hasPermission(effective, "view_fitdog_alerts")) return true;
    if (hasAnyRole(effective, ["super_admin", "admin", "management", "front_desk_coordinator"])) return true;
    const roleKey = legacyRoleToRoleKey(legacyRole);
    return (
      roleKey === "super_admin" ||
      roleKey === "admin" ||
      roleKey === "management" ||
      roleKey === "front_desk_coordinator"
    );
  }

  if (tab === "vip_auto_book") {
    if (board !== "staff") return false;
    if (isFullAdminLegacyRole(legacyRole) || isSuperAdminAccess(access)) return true;
    const effective = access ?? accessFromLegacyRole(null, null, legacyRole);
    if (hasPermission(effective, "view_vip_auto_book") || hasPermission(effective, "manage_vip_auto_book")) {
      return true;
    }
    if (hasAnyRole(effective, ["super_admin", "admin", "management", "front_desk_coordinator"])) return true;
    const roleKey = legacyRoleToRoleKey(legacyRole);
    return (
      roleKey === "super_admin" ||
      roleKey === "admin" ||
      roleKey === "management" ||
      roleKey === "front_desk_coordinator"
    );
  }

  // Menu hubs — staff board only, for roles whose cleaned sidebar includes that hub.
  if (
    tab === "sa_floor_hub" ||
    tab === "sa_whiteboard_hub" ||
    tab === "sa_people_hub" ||
    tab === "sa_apps_hub" ||
    tab === "sa_admin_hub"
  ) {
    if (tab === "sa_apps_hub" && board === "marketing") {
      const effective = access ?? accessFromLegacyRole(null, null, legacyRole);
      return (
        isMarketingLegacyRole(legacyRole) ||
        hasAnyRole(effective, ["marketing"]) ||
        isFullAdminLegacyRole(legacyRole) ||
        isSuperAdminAccess(effective)
      );
    }
    if (board !== "staff") return false;
    if (isSuperAdminLegacyRole(legacyRole) || isSuperAdminAccess(access)) return true;
    if (isFullAdminLegacyRole(legacyRole)) return true;
    // Avoid circular imports: mirror role-hub-nav primary membership.
    if (legacyRole === "assistant_manager") return true;
    if (legacyRole === "front_desk_coordinator" || legacyRole === "team_leader") {
      return tab === "sa_floor_hub" || tab === "sa_whiteboard_hub" || tab === "sa_apps_hub";
    }
    if (
      legacyRole === "trainer" ||
      legacyRole === "groomer" ||
      legacyRole === "daycare" ||
      legacyRole === "driver" ||
      legacyRole === "hiker"
    ) {
      return tab === "sa_floor_hub" || tab === "sa_apps_hub";
    }
    return false;
  }

  if (isFullAdminLegacyRole(legacyRole) || isSuperAdminAccess(access)) {
    return true;
  }

  // Remote Whiteboard Cast controls real building displays — full admins only
  // (owner/manager are handled by the early return above).
  if (tab === "remote_cast") return false;

  // Defense-in-depth: TL Digi Board config stays full-admin only even if permissions are customized.
  if (tab === "tl_digi_board") return false;

  if (tab === "cast_tv") {
    const effective = access ?? accessFromLegacyRole(null, null, legacyRole);
    if (hasPermission(effective, "manage_cast_tv")) return true;
    return isMarketingLegacyRole(legacyRole);
  }

  if (board === "marketing") {
    const effective = access ?? accessFromLegacyRole(null, null, legacyRole);
    if (!canAccessAdminBoard("marketing", effective, legacyRole)) return false;
    return (MARKETING_BOARD_TABS as readonly string[]).includes(tab);
  }

  const effective = access ?? accessFromLegacyRole(null, null, legacyRole);

  if (tab === "management_support" && board === "staff") {
    if (canSubmitWriteUpForUser(effective, legacyRole)) return true;
  }

  if (tab === "write_ups" && board === "staff") {
    return (
      canSubmitWriteUpForUser(effective, legacyRole) ||
      canReviewWriteUpsForUser(effective, legacyRole) ||
      canViewOwnWriteUpsForUser(effective, legacyRole)
    );
  }

  if (tab === "write_up_review" && board === "staff") {
    return canReviewWriteUpsForUser(effective, legacyRole);
  }

  if (tab === "complaint_review" && board === "staff") {
    return canReviewManagementSupportForUser(effective, legacyRole);
  }

  if (
    tab === "templates" &&
    (isTeamLeaderLegacyRole(legacyRole) || isFrontDeskCoordinatorLegacyRole(legacyRole))
  ) {
    return false;
  }

  if (isFrontDeskCoordinatorLegacyRole(legacyRole)) {
    if (board !== "staff") return false;
    return (FRONT_DESK_COORDINATOR_TABS as readonly string[]).includes(tab);
  }

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
    if (tab === "package_commissions") return hasPermission(effective, "view_package_commissions");
    if (tab === "management_support") return hasAnyPermission(effective, ["submit_trainer_complaint", "view_own_trainer_submissions", "view_package_commissions"]);
    return (TRAINER_TABS as readonly string[]).includes(tab);
  }

  if (isDogHandlerLegacyRole(legacyRole)) {
    if (board !== "staff") return false;
    return (DOG_HANDLER_TABS as readonly string[]).includes(tab);
  }

  if (isMarketingLegacyRole(legacyRole)) {
    if (board === "staff") {
      return (
        tab === "crossover_communication" ||
        tab === "bulk_photo_upload" ||
        tab === "media_library" ||
        tab === "help"
      );
    }
    if (board !== "lobby") return false;
    return (MARKETING_TABS as readonly string[]).includes(tab);
  }

  if (ADMIN_SUPPORT_TAB_SET.has(tab)) {
    if (board !== "staff") return false;
    if (isGroomerLegacyRole(legacyRole) || isTeamLeaderLegacyRole(legacyRole) || isTrainerLegacyRole(legacyRole)) return false;
    return canReviewManagementSupportForUser(effective, legacyRole);
  }

  if (ADMIN_HR_TAB_SET.has(tab) || tab === "hr_pip") {
    if (board !== "staff") return false;
    return canAccessHrPanelsForUser(effective, legacyRole);
  }

  if (
    tab === "management_support" &&
    hasPermission(effective, "review_management_support") &&
    !isTeamLeaderLegacyRole(legacyRole) &&
    !isGroomerLegacyRole(legacyRole) &&
    !isTrainerLegacyRole(legacyRole) &&
    !isFrontDeskCoordinatorLegacyRole(legacyRole)
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
      hasPermission(effective, "manage_lobby_board") ||
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

/** Open the Front Desk Communications Log when the role has view access. */
export function canAccessFrontDeskLogForRole(role?: string | null) {
  const access = accessFromLegacyRole(null, null, role);
  return hasPermission(access, "view_front_desk_log");
}

/** Submit new Team Log entries when the role has create access. */
export function canCreateFrontDeskLogForRole(role?: string | null) {
  const access = accessFromLegacyRole(null, null, role);
  return hasPermission(access, "create_front_desk_log");
}

/** Edit / reply / move Team Log entries when the role has edit access. */
export function canEditFrontDeskLogForRole(role?: string | null) {
  const access = accessFromLegacyRole(null, null, role);
  return hasPermission(access, "edit_front_desk_log");
}

export function firstAccessibleAdminTab(
  access: UserAccess | null | undefined,
  legacyRole?: string | null,
  board: AdminBoardType = "staff",
  options?: { isDemo?: boolean }
): string {
  if (options?.isDemo && board === "staff") return "demo_push";

  if (board === "marketing") {
    for (const tab of MARKETING_BOARD_TABS) {
      if (canAccessAdminTab(access, tab, legacyRole, "marketing", options)) return tab;
    }
    return "cast_tv";
  }

  const resolvedBoard = isStaffDigiBoardOnlyLegacyRole(legacyRole)
    ? "staff"
    : isMarketingLegacyRole(legacyRole) && board === "lobby"
      ? "lobby"
      : board;

  // Prefer My Shift homepage when the role can open it.
  if (resolvedBoard === "staff" && canAccessAdminTab(access, "my_shift", legacyRole, "staff", options)) {
    return "my_shift";
  }

  // Fall back to Team Log whenever the role can open it.
  if (
    resolvedBoard === "staff" &&
    canAccessAdminTab(access, "crossover_communication", legacyRole, "staff", options)
  ) {
    return "crossover_communication";
  }

  if (isFullAdminLegacyRole(legacyRole) || isSuperAdminAccess(access)) {
    return "overview";
  }

  if (isFrontDeskCoordinatorLegacyRole(legacyRole) && resolvedBoard === "staff") {
    for (const tab of FRONT_DESK_COORDINATOR_TABS) {
      if (canAccessAdminTab(access, tab, legacyRole, resolvedBoard, options)) return tab;
    }
    return "push_notices";
  }

  if (isTeamLeaderLegacyRole(legacyRole) && resolvedBoard === "staff") {
    for (const tab of TEAM_LEADER_TABS) {
      if (canAccessAdminTab(access, tab, legacyRole, resolvedBoard, options)) return tab;
    }
    return "push_notices";
  }

  if (isGroomerLegacyRole(legacyRole) && resolvedBoard === "staff") {
    for (const tab of GROOMER_TABS) {
      if (canAccessAdminTab(access, tab, legacyRole, resolvedBoard, options)) return tab;
    }
    return "grooming_push";
  }

  if (isTrainerLegacyRole(legacyRole) && resolvedBoard === "staff") {
    for (const tab of TRAINER_TABS) {
      if (canAccessAdminTab(access, tab, legacyRole, resolvedBoard, options)) return tab;
    }
    return "trainer_push";
  }

  if (isDogHandlerLegacyRole(legacyRole) && resolvedBoard === "staff") {
    for (const tab of DOG_HANDLER_TABS) {
      if (canAccessAdminTab(access, tab, legacyRole, resolvedBoard, options)) return tab;
    }
    return "checklist";
  }

  if (isMarketingLegacyRole(legacyRole) && resolvedBoard === "lobby") {
    for (const tab of MARKETING_TABS) {
      if (canAccessAdminTab(access, tab, legacyRole, resolvedBoard, options)) return tab;
    }
    return "content";
  }

  const tabs =
    resolvedBoard === "staff"
      ? [
          "crossover_communication",
          "push_notices",
          "grooming_push",
          "owner_follow_up",
          "active_issues",
          "staff_directory",
          "whiteboard_preview",
          "yard_links",
          "templates",
          "notifications",
          "package_commissions",
          "management_support",
          "ms_hub",
          "help"
        ]
      : ["overview", "content", "users", "settings", "integrations", "help"];

  for (const tab of tabs) {
    if (canAccessAdminTab(access, tab, legacyRole, resolvedBoard, options)) return tab;
  }
  return "help";
}
