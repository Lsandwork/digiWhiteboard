import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABELS,
  MODERATION_REASON_CODES,
  MODERATION_REASON_LABELS,
  OPERATIONAL_DEPARTMENTS,
  BARK_OUT_MESSAGE_MAX,
  BARK_OUT_CONTEXT_MAX,
  ENGAGEMENT_DEPARTMENTS,
  TEAM_ENGAGEMENT_MIGRATION,
  departmentLabel
} from "@/lib/team-engagement/constants";
import {
  accessView,
  aiPolicyView,
  changeRole,
  featureControlsView,
  integrationsView,
  permissionsView,
  retentionView,
  runRetentionPurge,
  saveSetting,
  securityView,
  setRolePermission,
  settingsView,
  systemHealthView,
  testAiConnection
} from "@/lib/team-engagement/administration";
import {
  approveBarkOut,
  confirmBarkOut,
  createBarkOut,
  employeeFeed,
  escalateBarkOut,
  leadershipBarkOuts,
  moderationQueue,
  myBarkOuts,
  reactToBarkOut,
  rejectBarkOut,
  removeBarkOut,
  repeatViolations,
  reportBarkOut,
  resolveReport,
  withdrawBarkOut
} from "@/lib/team-engagement/bark-outs";
import { canViewEmployee, requireFeature, scopeLabel, type ServiceContext } from "@/lib/team-engagement/context";
import {
  analytics,
  auditHistory,
  employeeAvatar,
  employeeOptions,
  employeeProfile,
  overview,
  reportsCatalog,
  staffDirectory,
  workload
} from "@/lib/team-engagement/insights";
import {
  LEADERSHIP_ACTION_RULES,
  PARTICIPANT_ACTION_RULES,
  TIER_LABELS,
  defaultEngagementSection,
  engagementNavigation,
  type LeadershipAction,
  type LeadershipView,
  type ParticipantAction
} from "@/lib/team-engagement/permissions";
import {
  announcementsForEmployee,
  archiveAnnouncement,
  assignDepartmentManager,
  createAnnouncement,
  decideNomination,
  departmentProfiles,
  listAnnouncements,
  listDevelopment,
  listFeedback,
  listPrograms,
  myFeedback,
  myPreferences,
  noteFeedback,
  nominate,
  recognitionForEmployee,
  respondToFeedback,
  saveDepartment,
  saveDevelopmentRecord,
  savePreferences,
  saveProgram,
  sharedDevelopmentForEmployee,
  submitFeedback,
  updateFeedback,
  withdrawNomination
} from "@/lib/team-engagement/records";

type Params = Record<string, string | undefined>;
type Body = Record<string, unknown>;

export function paramsFromUrl(url: URL): Params {
  const params: Params = {};
  url.searchParams.forEach((value, key) => {
    if (key !== "view") params[key] = value;
  });
  return params;
}

async function contextView(ctx: ServiceContext) {
  const settings = await ctx.settings();
  const nav = engagementNavigation(ctx.actor.tier, ctx.actor.permissions);
  const departments = ctx.actor.scope.all ? ENGAGEMENT_DEPARTMENTS : ctx.actor.scope.departments;
  return {
    actor: {
      userId: ctx.actor.userId,
      name: ctx.actor.name,
      tier: ctx.actor.tier,
      tierLabel: ctx.actor.tier ? TIER_LABELS[ctx.actor.tier] : null,
      permissions: ctx.actor.permissions,
      scope: {
        all: ctx.actor.scope.all,
        label: scopeLabel(ctx.actor.scope),
        departments: departments.map((key) => ({ key, label: departmentLabel(key) }))
      }
    },
    nav,
    defaultSection: defaultEngagementSection(nav),
    storageReady: ctx.storageReady,
    migration: TEAM_ENGAGEMENT_MIGRATION,
    features: settings.features,
    categories: settings.categories.filter((category) => category.active),
    allCategories: settings.categories,
    participation: settings.participation,
    limits: { message: BARK_OUT_MESSAGE_MAX, context: BARK_OUT_CONTEXT_MAX },
    ai: { configured: ctx.aiConfigured(), enabled: settings.aiPolicy.enabled },
    moderationReasons: MODERATION_REASON_CODES.map((code) => ({ code, label: MODERATION_REASON_LABELS[code] })),
    feedbackCategories: FEEDBACK_CATEGORIES.map((key) => ({ key, label: FEEDBACK_CATEGORY_LABELS[key] }))
  };
}

async function departmentsView(ctx: ServiceContext) {
  const [{ profiles, managers }, directory] = await Promise.all([
    ctx.storageReady ? departmentProfiles(ctx) : Promise.resolve({ profiles: [], managers: [] }),
    ctx.directory()
  ]);
  const keys = ctx.actor.scope.all ? ENGAGEMENT_DEPARTMENTS : ctx.actor.scope.departments;
  const team = directory.employees.filter((employee) => employee.active && canViewEmployee(ctx.actor, employee));
  return {
    canManage: ctx.actor.permissions.includes("engagement.manage_departments"),
    items: keys.map((key) => {
      const profile = profiles.find((row) => row.department_key === key);
      return {
        key,
        label: departmentLabel(key),
        operational: OPERATIONAL_DEPARTMENTS.includes(key),
        description: profile?.description ?? null,
        recognitionEnabled: profile?.recognition_enabled !== false,
        updatedBy: profile?.updated_by_name ?? null,
        updatedAt: profile?.updated_at ?? null,
        headcount: team.filter((employee) => (employee.departments as string[]).includes(key)).length,
        managers: managers
          .filter((row) => row.department_key === key)
          .map((row) => ({
            userId: row.manager_user_id,
            name: directory.byId.get(row.manager_user_id)?.name ?? "Former manager",
            assignedBy: row.assigned_by_name,
            assignedAt: row.created_at
          }))
      };
    })
  };
}

export async function runLeadershipView(ctx: ServiceContext, view: LeadershipView, params: Params): Promise<unknown> {
  switch (view) {
    case "context":
      return contextView(ctx);
    case "overview":
      return overview(ctx);
    case "staff":
      return staffDirectory(ctx, params);
    case "profile":
      return employeeProfile(ctx, { userId: params.userId });
    case "avatar":
      return employeeAvatar(ctx, { userId: params.userId });
    case "employees":
      return employeeOptions(ctx, { tier: params.tier });
    case "bark_outs":
      return leadershipBarkOuts(ctx, params);
    case "moderation": {
      const [queue, repeats] = await Promise.all([moderationQueue(ctx, params), repeatViolations(ctx)]);
      return { ...queue, repeatViolations: repeats };
    }
    case "workload":
      return workload(ctx, params);
    case "development":
      return listDevelopment(ctx, { employeeUserId: params.userId, status: params.status, type: params.type });
    case "feedback":
      return listFeedback(ctx, params);
    case "announcements":
      return listAnnouncements(ctx, { includeArchived: params.includeArchived === "1" });
    case "programs":
      return listPrograms(ctx);
    case "analytics":
      return analytics(ctx, params);
    case "reports":
      return reportsCatalog(ctx);
    case "departments":
      return departmentsView(ctx);
    case "audit":
      return auditHistory(ctx, params);
    case "settings":
      return settingsView(ctx);
    case "access":
      return accessView(ctx);
    case "permissions":
      return permissionsView(ctx);
    case "ai_policy":
      return aiPolicyView(ctx);
    case "security":
      return securityView(ctx);
    case "retention":
      return retentionView(ctx);
    case "features":
      return featureControlsView(ctx);
    case "integrations":
      return integrationsView(ctx);
    case "system_health":
      return systemHealthView(ctx);
  }
}

export async function runLeadershipAction(ctx: ServiceContext, action: LeadershipAction, body: Body): Promise<unknown> {
  const rule = LEADERSHIP_ACTION_RULES[action];
  await requireFeature(ctx, "feature" in rule ? rule.feature : undefined);
  switch (action) {
    case "create_bark_out":
      return createBarkOut(ctx, body);
    case "confirm_bark_out":
      return confirmBarkOut(ctx, body);
    case "withdraw_bark_out":
      return withdrawBarkOut(ctx, body);
    case "react_bark_out":
      return reactToBarkOut(ctx, body, true);
    case "unreact_bark_out":
      return reactToBarkOut(ctx, body, false);
    case "approve_bark_out":
      return approveBarkOut(ctx, body);
    case "reject_bark_out":
      return rejectBarkOut(ctx, body);
    case "remove_bark_out":
      return removeBarkOut(ctx, body);
    case "escalate_bark_out":
      return escalateBarkOut(ctx, body);
    case "resolve_report":
      return resolveReport(ctx, body);
    case "save_development_record":
      return saveDevelopmentRecord(ctx, body);
    case "respond_feedback":
      return respondToFeedback(ctx, body);
    case "update_feedback":
      return updateFeedback(ctx, body);
    case "note_feedback":
      return noteFeedback(ctx, body);
    case "create_announcement":
      return createAnnouncement(ctx, body);
    case "archive_announcement":
      return archiveAnnouncement(ctx, body);
    case "nominate":
      return nominate(ctx, body);
    case "withdraw_nomination":
      return withdrawNomination(ctx, body);
    case "save_program":
      return saveProgram(ctx, body);
    case "decide_nomination":
      return decideNomination(ctx, body);
    case "save_department":
      return saveDepartment(ctx, body);
    case "assign_department_manager":
      return assignDepartmentManager(ctx, body, true);
    case "remove_department_manager":
      return assignDepartmentManager(ctx, body, false);
    case "save_categories":
      return saveSetting(ctx, "categories", body);
    case "save_participation":
      return saveSetting(ctx, "participation", body);
    case "save_ai_policy":
      return saveSetting(ctx, "ai_policy", body);
    case "test_ai_connection":
      return testAiConnection(ctx);
    case "save_features":
      return saveSetting(ctx, "features", body);
    case "save_retention":
      return saveSetting(ctx, "retention", body);
    case "run_retention_purge":
      return runRetentionPurge(ctx, body);
    case "change_role":
      return changeRole(ctx, body);
    case "set_role_permission":
      return setRolePermission(ctx, body);
  }
}

// ---------------------------------------------------------------------------------------------
// Employee Bark Outs & suggestions (every staff role)
// ---------------------------------------------------------------------------------------------

export const PARTICIPANT_VIEWS = ["home", "feed", "mine", "feedback"] as const;
export type ParticipantView = (typeof PARTICIPANT_VIEWS)[number];

export function isParticipantView(value: string): value is ParticipantView {
  return (PARTICIPANT_VIEWS as readonly string[]).includes(value);
}

async function participantHome(ctx: ServiceContext) {
  const settings = await ctx.settings();
  if (!ctx.storageReady) {
    return { storageReady: false, features: settings.features };
  }
  const directory = await ctx.directory();
  const [feed, mine, preferences, announcements, recognition, development, feedback] = await Promise.all([
    settings.features.bark_outs ? employeeFeed(ctx, {}) : null,
    myBarkOuts(ctx),
    myPreferences(ctx),
    announcementsForEmployee(ctx),
    settings.features.programs ? recognitionForEmployee(ctx) : { items: [] },
    sharedDevelopmentForEmployee(ctx),
    settings.features.feedback ? myFeedback(ctx) : { items: [] }
  ]);
  return {
    storageReady: true,
    me: { userId: ctx.actor.userId, name: ctx.actor.name, canPost: ctx.actor.permissions.includes("engagement.create_bark_out") && !ctx.actor.impersonated },
    features: settings.features,
    categories: settings.categories.filter((category) => category.active),
    participation: {
      minMessageLength: settings.participation.minMessageLength,
      dailyLimit: settings.participation.dailyLimit,
      perRecipientWeeklyLimit: settings.participation.perRecipientWeeklyLimit
    },
    limits: { message: BARK_OUT_MESSAGE_MAX, context: BARK_OUT_CONTEXT_MAX },
    recipients: directory.employees
      .filter((employee) => employee.active && employee.userId !== ctx.actor.userId)
      .map((employee) => ({
        userId: employee.userId,
        name: employee.name,
        title: employee.title,
        departments: employee.departments.map((key) => departmentLabel(key))
      })),
    feed,
    mine,
    preferences,
    announcements: announcements.items,
    recognition: recognition.items,
    development: development.items,
    feedback: feedback.items,
    feedbackCategories: FEEDBACK_CATEGORIES.map((key) => ({ key, label: FEEDBACK_CATEGORY_LABELS[key] })),
    departments: ENGAGEMENT_DEPARTMENTS.map((key) => ({ key, label: departmentLabel(key) })),
    impersonated: ctx.actor.impersonated
  };
}

export async function runParticipantView(ctx: ServiceContext, view: ParticipantView, params: Params): Promise<unknown> {
  switch (view) {
    case "home":
      return participantHome(ctx);
    case "feed":
      return employeeFeed(ctx, params);
    case "mine":
      return myBarkOuts(ctx);
    case "feedback":
      return myFeedback(ctx);
  }
}

export async function runParticipantAction(ctx: ServiceContext, action: ParticipantAction, body: Body): Promise<unknown> {
  const rule = PARTICIPANT_ACTION_RULES[action];
  await requireFeature(ctx, "feature" in rule ? rule.feature : undefined);
  switch (action) {
    case "create_bark_out":
      return createBarkOut(ctx, body);
    case "confirm_bark_out":
      return confirmBarkOut(ctx, body);
    case "withdraw_bark_out":
      return withdrawBarkOut(ctx, body);
    case "react_bark_out":
      return reactToBarkOut(ctx, body, true);
    case "unreact_bark_out":
      return reactToBarkOut(ctx, body, false);
    case "report_bark_out":
      return reportBarkOut(ctx, body);
    case "submit_feedback":
      return submitFeedback(ctx, body);
    case "save_preferences":
      return savePreferences(ctx, body);
  }
}
