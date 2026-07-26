import type { PermissionKey } from "@/lib/admin/permissions";

/** All Ruffly permission keys (dotted namespace as specified). */
export const RUFFLY_PERMISSIONS = [
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
  "ruffly.audit.view"
] as const satisfies readonly PermissionKey[];

export type RufflyPermission = (typeof RUFFLY_PERMISSIONS)[number];

export const RUFFLY_MANAGEMENT_PERMISSIONS: RufflyPermission[] = [
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
  "ruffly.ai.manage"
];

export const RUFFLY_FRONT_DESK_PERMISSIONS: RufflyPermission[] = [
  "ruffly.view",
  "ruffly.dashboard.view",
  "ruffly.inbox.view",
  "ruffly.inbox.reply",
  "ruffly.contacts.view",
  "ruffly.contacts.edit",
  "ruffly.leads.view",
  "ruffly.leads.edit",
  "ruffly.reviews.view"
];

export const RUFFLY_MARKETING_PERMISSIONS: RufflyPermission[] = [
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
  "ruffly.contacts.view"
];

export const RUFFLY_TRAINER_PERMISSIONS: RufflyPermission[] = [
  "ruffly.view",
  "ruffly.inbox.view",
  "ruffly.inbox.reply",
  "ruffly.contacts.view",
  "ruffly.leads.view"
];

export const RUFFLY_GROOMER_PERMISSIONS: RufflyPermission[] = [
  "ruffly.view",
  "ruffly.inbox.view",
  "ruffly.inbox.reply",
  "ruffly.leads.view"
];

export const RUFFLY_TEAM_LEAD_PERMISSIONS: RufflyPermission[] = [
  "ruffly.view",
  "ruffly.dashboard.view",
  "ruffly.inbox.view",
  "ruffly.inbox.reply",
  "ruffly.inbox.assign",
  "ruffly.contacts.view",
  "ruffly.leads.view",
  "ruffly.leads.edit",
  "ruffly.feedback.view"
];
