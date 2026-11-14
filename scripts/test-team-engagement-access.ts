/**
 * Manage Team Engagement authorization: tab visibility, route and API access, department scope, privileged
 * changes, exports, impersonation, and the self-escalation guards in User Management and the Staff Directory.
 * Run: npx tsx scripts/test-team-engagement-access.ts
 */
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  accessFromLegacyRole,
  buildUserAccess,
  canAccessAdminTab,
  canUseTeamEngagement,
  type PermissionKey
} from "@/lib/admin/permissions";
import { createAdminSessionToken, ADMIN_SESSION_COOKIE } from "@/lib/admin/session";
import { assertUserMutationAllowed } from "@/lib/admin/super-admin-guards";
import { roleAssignmentError, selfAccessChangeError } from "@/lib/admin/user-creation-access";
import type { AdminUserRecord } from "@/lib/admin/users";
import { evaluateDirectoryLoginChange, evaluateDirectoryLoginDelete } from "@/lib/staff/directory-login";
import { EngagementError } from "@/lib/team-engagement/errors";
import { handleExport, handleLeadershipGet, handleLeadershipPost, handleParticipantGet, handleParticipantPost } from "@/lib/team-engagement/http";
import { EXPORT_TYPES, buildExport, staffDirectory, employeeProfile, analytics } from "@/lib/team-engagement/insights";
import { leadershipBarkOuts, moderationQueue, approveBarkOut } from "@/lib/team-engagement/bark-outs";
import { createAnnouncement, listDevelopment, nominate, saveDevelopmentRecord, saveProgram } from "@/lib/team-engagement/records";
import { changeRole } from "@/lib/team-engagement/administration";
import {
  LEADERSHIP_ACTION_RULES,
  LEADERSHIP_VIEW_RULES,
  engagementNavigation,
  type LeadershipAction,
  type LeadershipView
} from "@/lib/team-engagement/permissions";
import type { BarkOutRow, DevelopmentRecordRow } from "@/lib/team-engagement/types";
import { middleware } from "@/middleware";
import {
  NOW,
  PEOPLE,
  STANDARD_LEGACY_ROLES,
  accessFor,
  actorFor,
  auditRows,
  countingDb,
  fakeAccessControl,
  flushAsyncWrites,
  handlerDeps,
  request,
  seededDb,
  serviceContextFor,
  type Person
} from "./team-engagement-fixtures";

async function json(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
}

async function expectStatus(response: Response, status: number, label: string) {
  const body = await json(response.clone());
  assert.equal(response.status, status, `${label}: expected ${status}, got ${response.status} ${JSON.stringify(body)}`);
  return body;
}

async function rejects(promise: Promise<unknown>, status: number, label: string) {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof EngagementError, `${label}: expected EngagementError, got ${String(error)}`);
    assert.equal(error.status, status, `${label}: expected ${status}, got ${error.status} (${error.message})`);
    return error;
  }
  assert.fail(`${label}: expected a ${status} error`);
}

const ALL_VIEWS = Object.keys(LEADERSHIP_VIEW_RULES) as LeadershipView[];
const ALL_ACTIONS = Object.keys(LEADERSHIP_ACTION_RULES) as LeadershipAction[];
const SUPER_ADMIN_VIEWS = ALL_VIEWS.filter((view) => "superAdminOnly" in LEADERSHIP_VIEW_RULES[view]);
const SUPER_ADMIN_ACTIONS = ALL_ACTIONS.filter((action) => "superAdminOnly" in LEADERSHIP_ACTION_RULES[action]);
const ENGAGEMENT_SA_ONLY: PermissionKey[] = [
  "engagement.manage_permissions",
  "engagement.configure_ai",
  "engagement.manage_security",
  "engagement.manage_integrations"
];
const ALL_ENGAGEMENT: PermissionKey[] = [
  "engagement.view",
  "engagement.view_all_departments",
  "engagement.manage_team",
  "engagement.manage_departments",
  "engagement.moderate",
  "engagement.manage_programs",
  "engagement.manage_settings",
  "engagement.view_analytics",
  "engagement.export",
  "engagement.view_audit_logs",
  ...ENGAGEMENT_SA_ONLY
];

function barkOut(overrides: Partial<BarkOutRow> & Pick<BarkOutRow, "id">): BarkOutRow {
  return {
    author_user_id: PEOPLE.groomer.id,
    author_name: PEOPLE.groomer.name,
    author_departments: ["grooming"],
    recipient_user_id: PEOPLE.groomer2.id,
    recipient_name: PEOPLE.groomer2.name,
    recipient_departments: ["grooming"],
    category: "teamwork",
    message: "Thanks for covering the bath station during the lunch rush today.",
    context: null,
    status: "published",
    moderation_outcome: "moderator_approved",
    author_confirmations: 0,
    author_prompt: null,
    author_notice: null,
    content_fingerprint: overrides.id,
    escalated_at: null,
    escalation_note: null,
    open_report_count: 0,
    published_at: "2026-11-10T18:00:00.000Z",
    decided_at: null,
    decided_by_user_id: null,
    decided_by_name: null,
    created_at: "2026-11-10T17:00:00.000Z",
    updated_at: "2026-11-10T18:00:00.000Z",
    ...overrides
  };
}

const IDS = {
  groomingPost: "bbbbbbbb-0000-4000-8000-000000000001",
  daycarePost: "bbbbbbbb-0000-4000-8000-000000000002",
  crossPost: "bbbbbbbb-0000-4000-8000-000000000003",
  groomingPending: "bbbbbbbb-0000-4000-8000-000000000004",
  daycarePending: "bbbbbbbb-0000-4000-8000-000000000005",
  formulaPost: "bbbbbbbb-0000-4000-8000-000000000006",
  groomerGoal: "cccccccc-0000-4000-8000-000000000001",
  handlerGoal: "cccccccc-0000-4000-8000-000000000002"
};

function developmentRecord(id: string, employee: Person): DevelopmentRecordRow {
  return {
    id,
    employee_user_id: employee.id,
    employee_name: employee.name,
    employee_departments: employee.departments,
    record_type: "goal",
    title: `Goal for ${employee.name}`,
    details: "Private leadership note",
    status: "in_progress",
    visibility: "leadership",
    due_on: "2026-11-20",
    completed_at: null,
    created_by_user_id: PEOPLE.admin.id,
    created_by_name: PEOPLE.admin.name,
    updated_by_user_id: null,
    updated_by_name: null,
    created_at: "2026-11-01T17:00:00.000Z",
    updated_at: "2026-11-01T17:00:00.000Z"
  };
}

function populatedDb() {
  const db = seededDb();
  db.tables.team_engagement_bark_outs.push(
    barkOut({ id: IDS.groomingPost }),
    barkOut({
      id: IDS.daycarePost,
      author_user_id: PEOPLE.handler.id,
      author_name: PEOPLE.handler.name,
      author_departments: ["daycare"],
      recipient_user_id: PEOPLE.teamLeader.id,
      recipient_name: PEOPLE.teamLeader.name,
      recipient_departments: ["daycare"]
    }),
    barkOut({
      id: IDS.crossPost,
      author_user_id: PEOPLE.frontDesk.id,
      author_name: PEOPLE.frontDesk.name,
      author_departments: ["front_desk"],
      recipient_user_id: PEOPLE.groomer.id,
      recipient_name: PEOPLE.groomer.name,
      recipient_departments: ["grooming"],
      category: "cross_department"
    }),
    barkOut({ id: IDS.groomingPending, status: "pending_review", moderation_outcome: "human_review", published_at: null }),
    barkOut({
      id: IDS.daycarePending,
      status: "pending_review",
      moderation_outcome: "human_review",
      published_at: null,
      author_user_id: PEOPLE.teamLeader.id,
      author_name: PEOPLE.teamLeader.name,
      author_departments: ["daycare"],
      recipient_user_id: PEOPLE.handler.id,
      recipient_name: PEOPLE.handler.name,
      recipient_departments: ["daycare"]
    }),
    barkOut({
      id: IDS.formulaPost,
      message: "=HYPERLINK(\"https://example.test\",\"thanks\") for the help today with the big dogs",
      author_user_id: PEOPLE.trainer.id,
      author_name: PEOPLE.trainer.name,
      author_departments: ["training"],
      recipient_user_id: PEOPLE.frontDesk.id,
      recipient_name: PEOPLE.frontDesk.name,
      recipient_departments: ["front_desk"]
    })
  );
  db.tables.team_engagement_development_records.push(
    developmentRecord(IDS.groomerGoal, PEOPLE.groomer),
    developmentRecord(IDS.handlerGoal, PEOPLE.handler)
  );
  return db;
}

const countOnlySupabase = (activeSuperAdmins: number) =>
  ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: async () => ({ count: activeSuperAdmins, error: null })
        })
      })
    })
  }) as unknown as SupabaseClient;

function adminUser(p: Person): AdminUserRecord {
  return { id: p.id, email: p.email, full_name: p.name, role: p.legacyRole, status: "active" } as unknown as AdminUserRecord;
}

function directoryActor(p: Person) {
  return { id: p.id, legacyRole: p.legacyRole, access: accessFor(p) };
}

function directoryTarget(p: Person) {
  return { user: adminUser(p), access: accessFor(p) };
}

async function testTabVisibility() {
  // 6. Standard employees never see the tab, even when the role matrix is changed to grant engagement keys.
  for (const role of STANDARD_LEGACY_ROLES) {
    const access = accessFromLegacyRole(`user-${role}`, `${role}@fitdog.test`, role);
    assert.equal(canAccessAdminTab(access, "team_engagement", role, "staff"), false, `${role} must not see the tab`);
    assert.equal(canUseTeamEngagement(access, role), false, `${role} must not use Team Engagement`);
    const granted = { ...access, permissions: [...access.permissions, ...ALL_ENGAGEMENT] };
    assert.equal(canAccessAdminTab(granted, "team_engagement", role, "staff"), false, `${role} with matrix grants still has no tab`);
    const actor = actorFor(
      { id: "aaaaaaaa-0000-4000-8000-0000000009" + String(STANDARD_LEGACY_ROLES.indexOf(role)).padStart(2, "0"), name: "Pat Staff", email: `${role}@fitdog.test`, legacyRole: role, primaryRole: access.primaryRole, departments: [] },
      { addPermissions: ALL_ENGAGEMENT }
    );
    assert.equal(actor.tier, null);
    assert.deepEqual(
      actor.permissions.filter((permission) => permission !== "engagement.participate" && permission !== "engagement.create_bark_out"),
      [],
      `${role} keeps only participant permissions`
    );
    assert.deepEqual(engagementNavigation(actor.tier, actor.permissions), [], `${role} gets no Team Engagement navigation`);
  }
  for (const p of [PEOPLE.superAdmin, PEOPLE.admin, PEOPLE.groomingManager]) {
    assert.equal(canAccessAdminTab(accessFor(p), "team_engagement", p.legacyRole, "staff"), true, `${p.name} sees the tab`);
    assert.equal(canAccessAdminTab(accessFor(p), "team_engagement", p.legacyRole, "lobby"), false, "staff board only");
    assert.equal(canAccessAdminTab(accessFor(p), "team_engagement", p.legacyRole, "staff", { isDemo: true }), false, "never for demo sessions");
  }

  // Distinct navigation per tier.
  const sections = (p: Person) => engagementNavigation(actorFor(p).tier, actorFor(p).permissions).flatMap((group) => group.items.map((item) => item.label));
  assert.deepEqual(sections(PEOPLE.groomingManager), [
    "Team Overview",
    "Staff Directory",
    "Bark Outs",
    "Moderation Queue",
    "Workload Intelligence",
    "Employee Development",
    "Team Feedback",
    "Announcements",
    "Recognition Programs",
    "Team Reports"
  ]);
  assert.ok(sections(PEOPLE.admin).includes("Audit History") && sections(PEOPLE.admin).includes("Engagement Settings"));
  assert.ok(!sections(PEOPLE.admin).some((label) => ["Role & Permission Control", "AI Policy Configuration", "Security & Privacy"].includes(label)));
  for (const label of ["Management Access", "Admin Management", "Role & Permission Control", "AI Policy Configuration", "Data Retention", "Feature Controls"]) {
    assert.ok(sections(PEOPLE.superAdmin).includes(label), `Super Admin nav has ${label}`);
  }
}

async function testMiddleware() {
  process.env.ADMIN_SESSION_SECRET = "team-engagement-test-secret";
  process.env.RUFFOPS_DEMO_MODE = "enabled";
  const load = async (session: Parameters<typeof createAdminSessionToken>[0]) => {
    const token = createAdminSessionToken(session);
    const req = new NextRequest("https://www.fitdog.ruffops.com/admin?board=staff&tab=team_engagement", {
      headers: { cookie: `${ADMIN_SESSION_COOKIE}=${token}`, host: "www.fitdog.ruffops.com" }
    });
    return middleware(req);
  };
  const impersonated = await load({
    email: PEOPLE.groomingManager.email,
    adminUserId: PEOPLE.groomingManager.id,
    role: "assistant_manager",
    impersonatorEmail: PEOPLE.superAdmin.email
  });
  assert.ok([302, 307].includes(impersonated.status), `impersonated session is redirected (got ${impersonated.status})`);
  assert.ok(!new URL(impersonated.headers.get("location")!).searchParams.get("tab")?.includes("team_engagement"));

  const demo = await load({ email: "manager@demo.com", adminUserId: "demo-manager", role: "assistant_manager", isDemo: true });
  assert.ok([302, 307].includes(demo.status), "demo session is redirected");
  assert.equal(new URL(demo.headers.get("location")!).searchParams.get("tab"), "demo_push");

  const leader = await load({ email: PEOPLE.groomingManager.email, adminUserId: PEOPLE.groomingManager.id, role: "assistant_manager" });
  assert.ok(![302, 307].includes(leader.status) || !leader.headers.get("location")?.includes("tab="), "leaders load the tab");
}

async function testApiRefusals() {
  // 7 + 8. Every Team Engagement view, action, and export refuses standard employees before reading anything.
  for (const [index, role] of STANDARD_LEGACY_ROLES.entries()) {
    const p: Person = {
      id: `dddddddd-0000-4000-8000-${String(index).padStart(12, "0")}`,
      name: "Pat Staff",
      email: `${role}.api@fitdog.test`,
      legacyRole: role,
      primaryRole: accessFromLegacyRole(null, null, role).primaryRole,
      departments: ["grooming"]
    };
    const counting = countingDb(populatedDb());
    const deps = handlerDeps(counting.db, actorFor(p, { addPermissions: ALL_ENGAGEMENT }));
    for (const view of ALL_VIEWS) {
      const body = await expectStatus(await handleLeadershipGet(request(`/api/admin/team-engagement?view=${view}`), deps), 403, `${role} GET ${view}`);
      assert.deepEqual(Object.keys(body).sort(), ["code", "error"], "refusals carry no data");
    }
    await expectStatus(await handleLeadershipGet(request("/api/admin/team-engagement?view=not_a_view"), deps), 403, `${role} unknown view`);
    for (const action of ALL_ACTIONS) {
      await expectStatus(
        await handleLeadershipPost(request("/api/admin/team-engagement", { body: { action, id: IDS.groomingPending, userId: p.id, role: "super_admin" } }), deps),
        403,
        `${role} POST ${action}`
      );
    }
    await expectStatus(await handleLeadershipPost(request("/api/admin/team-engagement", { body: { action: "drop_tables" } }), deps), 403, `${role} unknown action`);
    await expectStatus(await handleLeadershipPost(request("/api/admin/team-engagement", { body: ["not", "an", "object"] }), deps), 403, `${role} malformed body`);
    for (const type of Object.keys(EXPORT_TYPES)) {
      await expectStatus(await handleExport(request(`/api/admin/team-engagement/export?type=${type}`), deps), 403, `${role} export ${type}`);
    }
    assert.deepEqual(counting.reads, [], `${role}: refused requests never read engagement data`);
    assert.equal(deps.contexts.length, 0, `${role}: no service context is created for refused requests`);
    await flushAsyncWrites();
    assert.ok(auditRows(counting.db, "access.denied").length > 0, `${role}: refusals are recorded`);
    assert.ok(counting.writes.every((write) => write === "insert:team_engagement_audit_events"), "refusals only write audit rows");
  }

  // Unauthenticated, demo, and temporary-password sessions get no context at all.
  process.env.ADMIN_SESSION_SECRET = "team-engagement-test-secret";
  await expectStatus(await handleLeadershipGet(request("/api/admin/team-engagement?view=overview")), 401, "no session");
  await expectStatus(await handleParticipantGet(request("/api/admin/bark-outs?view=home")), 401, "no session on the employee feed");
  for (const session of [
    { email: "manager@demo.com", adminUserId: "demo", role: "assistant_manager", isDemo: true },
    { email: PEOPLE.admin.email, adminUserId: PEOPLE.admin.id, role: "manager_admin", mustChangePassword: true }
  ]) {
    const token = createAdminSessionToken(session);
    const response = await handleLeadershipGet(
      new Request("https://www.fitdog.ruffops.com/api/admin/team-engagement?view=overview", { headers: { cookie: `${ADMIN_SESSION_COOKIE}=${token}` } })
    );
    assert.ok([401, 403].includes(response.status), `restricted session refused (${response.status})`);
  }

  // The employee Bark Out feed is separate: staff can read it, viewers without participation cannot.
  {
    const db = populatedDb();
    await expectStatus(await handleParticipantGet(request("/api/admin/bark-outs?view=feed"), handlerDeps(db, actorFor(PEOPLE.groomer))), 200, "groomer reads the feed");
    const viewer: Person = { id: "eeeeeeee-0000-4000-8000-000000000001", name: "Val Viewer", email: "val@fitdog.test", legacyRole: "viewer", primaryRole: "viewer", departments: [] };
    await expectStatus(await handleParticipantGet(request("/api/admin/bark-outs?view=feed"), handlerDeps(db, actorFor(viewer))), 403, "viewer has no feed");
  }
}

async function testImpersonation() {
  const db = populatedDb();
  const impersonatedLeader = handlerDeps(db, actorFor(PEOPLE.superAdmin, { impersonated: true }));
  const body = await expectStatus(await handleLeadershipGet(request("/api/admin/team-engagement?view=overview"), impersonatedLeader), 403, "impersonated leadership read");
  assert.equal(body.code, "impersonated");
  await expectStatus(
    await handleLeadershipPost(request("/api/admin/team-engagement", { body: { action: "approve_bark_out", id: IDS.groomingPending } }), impersonatedLeader),
    403,
    "impersonated moderation"
  );
  const impersonatedEmployee = handlerDeps(db, actorFor(PEOPLE.groomer, { impersonated: true }));
  await expectStatus(await handleParticipantGet(request("/api/admin/bark-outs?view=feed"), impersonatedEmployee), 200, "impersonated feed read");
  await expectStatus(
    await handleParticipantPost(
      request("/api/admin/bark-outs", {
        body: { action: "create_bark_out", recipientUserId: PEOPLE.groomer2.id, category: "teamwork", message: "Thanks for covering the bath station today." }
      }),
      impersonatedEmployee
    ),
    403,
    "impersonated write"
  );
  assert.equal(db.tables.team_engagement_bark_outs.length, 6, "nothing was posted while impersonating");
}

async function testManagementScope() {
  // 1. Management sees only their assigned team.
  const db = populatedDb();
  const manager = actorFor(PEOPLE.groomingManager);
  assert.deepEqual(manager.scope, { all: false, departments: ["grooming"] });
  const ctx = serviceContextFor(db, manager);

  const directory = await staffDirectory(ctx, {});
  assert.deepEqual(
    directory.items.map((item) => item.name),
    [PEOPLE.groomer.name, PEOPLE.groomer2.name],
    "only active grooming staff are listed"
  );
  const withInactive = await staffDirectory(ctx, { status: "all" });
  assert.ok(withInactive.items.some((item) => item.name === PEOPLE.formerGroomer.name));
  assert.ok(!withInactive.items.some((item) => item.name === PEOPLE.handler.name));

  const feed = await leadershipBarkOuts(ctx, {});
  assert.deepEqual(new Set(feed.items.map((item) => item.id)), new Set([IDS.groomingPost, IDS.crossPost]), "Bark Outs outside grooming stay hidden");

  const queue = await moderationQueue(ctx, {});
  assert.deepEqual(queue.items.map((item) => item.id), [IDS.groomingPending], "moderation queue is scoped");

  const development = await listDevelopment(ctx, {});
  assert.deepEqual(development.items.map((item) => item.id), [IDS.groomerGoal], "development records are scoped");

  const deps = handlerDeps(db, manager);
  const overview = (await expectStatus(await handleLeadershipGet(request("/api/admin/team-engagement?view=overview"), deps), 200, "manager overview")) as {
    headcount: { total: number };
  };
  assert.equal(overview.headcount.total, 2, "headcount covers the assigned team only");

  // 2. Management cannot reach other departments by changing a filter or an ID.
  await rejects(staffDirectory(ctx, { department: "daycare" }), 403, "department filter outside scope");
  await expectStatus(await handleLeadershipGet(request("/api/admin/team-engagement?view=staff&department=daycare"), deps), 403, "staff view outside scope");
  await expectStatus(await handleLeadershipGet(request("/api/admin/team-engagement?view=bark_outs&department=daycare"), deps), 403, "feed outside scope");
  await expectStatus(await handleLeadershipGet(request("/api/admin/team-engagement?view=analytics&department=daycare"), deps), 403, "analytics outside scope");
  await rejects(analytics(ctx, { department: "training" }), 403, "analytics service outside scope");
  await rejects(employeeProfile(ctx, { userId: PEOPLE.handler.id }), 404, "profile outside scope");
  await rejects(employeeProfile(ctx, { userId: PEOPLE.daycareManager.id }), 404, "peer manager profile");
  await rejects(employeeProfile(ctx, { userId: PEOPLE.admin.id }), 404, "admin profile");
  await rejects(employeeProfile(ctx, { userId: PEOPLE.groomingManager.id }), 404, "own profile");
  await rejects(listDevelopment(ctx, { employeeUserId: PEOPLE.handler.id }), 403, "development list outside scope");
  await rejects(
    saveDevelopmentRecord(ctx, { employeeUserId: PEOPLE.handler.id, recordType: "goal", title: "Learn the new kennel cards" }),
    403,
    "development write outside scope"
  );
  await rejects(approveBarkOut(ctx, { id: IDS.daycarePending }), 404, "moderation outside scope");
  await rejects(
    createAnnouncement(ctx, { title: "Daycare update", body: "Please restock the towels in the daycare room.", audienceDepartments: ["daycare"] }),
    403,
    "announcement outside scope"
  );
  const program = await saveProgram(serviceContextFor(db, actorFor(PEOPLE.admin)), {
    programType: "outstanding_teamwork",
    name: "Outstanding Teamwork",
    criteria: "Reviewed by leadership."
  });
  await rejects(
    nominate(ctx, { programId: program.program.id, nomineeUserId: PEOPLE.handler.id, reason: "Helped every handler during a very busy holiday week." }),
    403,
    "nomination outside scope"
  );
  assert.equal(db.tables.team_engagement_development_records.length, 2, "no out-of-scope writes landed");

  // Management never sees Bark Outs that only involve other departments in exports either.
  const exporter = actorFor(PEOPLE.groomingManager, { addPermissions: ["engagement.export"] });
  const csv = await buildExport(serviceContextFor(db, exporter), { type: "bark_outs", from: "2026-11-01", to: "2026-11-13" });
  assert.ok(csv.csv.includes(PEOPLE.groomer2.name) && !csv.csv.includes(PEOPLE.teamLeader.name), "export is scoped to grooming");
  await rejects(buildExport(serviceContextFor(db, exporter), { type: "bark_outs", department: "daycare" }), 403, "export outside scope");
}

async function testAdminLimits() {
  // 3. Admin works org-wide, but only where Admin is permitted.
  const db = populatedDb();
  const admin = actorFor(PEOPLE.admin);
  assert.equal(admin.scope.all, true);
  const ctx = serviceContextFor(db, admin);
  const directory = await staffDirectory(ctx, {});
  const names = directory.items.map((item) => item.name);
  for (const p of [PEOPLE.groomer, PEOPLE.handler, PEOPLE.trainer, PEOPLE.frontDesk, PEOPLE.groomingManager, PEOPLE.daycareManager]) {
    assert.ok(names.includes(p.name), `Admin sees ${p.name}`);
  }
  for (const p of [PEOPLE.superAdmin, PEOPLE.admin2, PEOPLE.admin]) {
    assert.ok(!names.includes(p.name), `Admin does not open records for ${p.name}`);
  }
  const deps = handlerDeps(db, admin);
  for (const view of ["overview", "analytics", "audit", "settings", "departments", "workload", "reports"] as const) {
    await expectStatus(await handleLeadershipGet(request(`/api/admin/team-engagement?view=${view}`), deps), 200, `admin ${view}`);
  }
  const tampered = handlerDeps(db, actorFor(PEOPLE.admin, { addPermissions: ENGAGEMENT_SA_ONLY }));
  assert.ok(!actorFor(PEOPLE.admin, { addPermissions: ENGAGEMENT_SA_ONLY }).permissions.some((permission) => ENGAGEMENT_SA_ONLY.includes(permission)));
  for (const view of SUPER_ADMIN_VIEWS) {
    await expectStatus(await handleLeadershipGet(request(`/api/admin/team-engagement?view=${view}`), deps), 403, `admin ${view}`);
    await expectStatus(await handleLeadershipGet(request(`/api/admin/team-engagement?view=${view}`), tampered), 403, `admin (matrix granted) ${view}`);
  }
  for (const action of SUPER_ADMIN_ACTIONS) {
    await expectStatus(
      await handleLeadershipPost(request("/api/admin/team-engagement", { body: { action, userId: PEOPLE.admin.id, role: "super_admin", reason: "Testing access controls." } }), tampered),
      403,
      `admin ${action}`
    );
  }
  const settings = (await expectStatus(await handleLeadershipGet(request("/api/admin/team-engagement?view=settings"), deps), 200, "admin settings")) as {
    aiPolicy: unknown;
    retention: unknown;
  };
  assert.equal(settings.aiPolicy, null, "AI policy stays with Super Admin");
  assert.equal(settings.retention, null, "retention stays with Super Admin");

  // Management cannot do Admin work either.
  const managerDeps = handlerDeps(db, actorFor(PEOPLE.groomingManager));
  for (const view of ["audit", "settings", "departments"] as const) {
    const expected = view === "departments" ? 200 : 403;
    await expectStatus(await handleLeadershipGet(request(`/api/admin/team-engagement?view=${view}`), managerDeps), expected, `manager ${view}`);
  }
  for (const action of ["save_department", "assign_department_manager", "save_program", "decide_nomination", "save_categories"] as const) {
    await expectStatus(
      await handleLeadershipPost(request("/api/admin/team-engagement", { body: { action, key: "grooming", userId: PEOPLE.groomingManager.id } }), managerDeps),
      403,
      `manager ${action}`
    );
  }
}

async function testNoSelfEscalation() {
  // 4. Admin cannot make themselves Super Admin, through Team Engagement or anywhere else.
  const db = populatedDb();
  const adminDeps = handlerDeps(db, actorFor(PEOPLE.admin, { addPermissions: ALL_ENGAGEMENT }), { accessControl: fakeAccessControl().port });
  await expectStatus(
    await handleLeadershipPost(
      request("/api/admin/team-engagement", {
        body: { action: "change_role", userId: PEOPLE.admin.id, role: "super_admin", reason: "I need more access today.", confirmName: PEOPLE.admin.name }
      }),
      adminDeps
    ),
    403,
    "admin self-promotion through Team Engagement"
  );
  const access = fakeAccessControl();
  await rejects(
    changeRole(serviceContextFor(db, actorFor(PEOPLE.superAdmin), { accessControl: access.port }), {
      userId: PEOPLE.superAdmin.id,
      role: "admin",
      reason: "Changing my own access.",
      confirmName: PEOPLE.superAdmin.name
    }),
    403,
    "nobody changes their own role here"
  );
  assert.equal(access.roleChanges.length, 0);

  const adminAccess = accessFor(PEOPLE.admin);
  await assert.rejects(
    assertUserMutationAllowed({
      supabase: countOnlySupabase(2),
      actorLegacyRole: "manager_admin",
      actorAccess: adminAccess,
      targetUserId: PEOPLE.admin.id,
      targetLegacyRole: "manager_admin",
      targetAccess: adminAccess,
      nextPrimaryRole: "super_admin",
      action: "update"
    }),
    /Only Super Admin can assign the Super Admin role/
  );
  assert.equal(roleAssignmentError(adminAccess, "manager_admin", ["super_admin"], adminAccess.roles), "You cannot assign that role.");
  const managerAccess = accessFor(PEOPLE.groomingManager);
  assert.equal(roleAssignmentError(managerAccess, "assistant_manager", ["admin"], managerAccess.roles), "You cannot assign that role.");
  assert.equal(roleAssignmentError(managerAccess, "assistant_manager", ["super_admin"], managerAccess.roles), "You cannot assign that role.");

  // User Management: nobody but Super Admin edits their own roles or departments.
  assert.ok(
    selfAccessChangeError({ isSelf: true, actorIsSuperAdmin: false, current: adminAccess, nextPrimaryRole: "super_admin", nextAdditionalRoles: null, nextDepartments: null })
  );
  assert.ok(
    selfAccessChangeError({ isSelf: true, actorIsSuperAdmin: false, current: managerAccess, nextPrimaryRole: null, nextAdditionalRoles: ["admin"], nextDepartments: null })
  );
  assert.ok(
    selfAccessChangeError({ isSelf: true, actorIsSuperAdmin: false, current: managerAccess, nextPrimaryRole: null, nextAdditionalRoles: null, nextDepartments: ["grooming", "daycare"] }),
    "managers cannot widen their own departments"
  );
  assert.equal(
    selfAccessChangeError({ isSelf: true, actorIsSuperAdmin: false, current: managerAccess, nextPrimaryRole: "management", nextAdditionalRoles: [], nextDepartments: ["management"] }),
    null,
    "saving unchanged access is fine"
  );
  assert.equal(
    selfAccessChangeError({ isSelf: false, actorIsSuperAdmin: false, current: managerAccess, nextPrimaryRole: "groomer", nextAdditionalRoles: null, nextDepartments: null }),
    null
  );

  // Staff Directory: the same rules apply to dashboard logins changed from a directory profile.
  const supabase = countOnlySupabase(2);
  const change = (actor: Person, target: Person | null, changes: { role?: string; department?: string | null; email?: string | null; password?: boolean }) =>
    evaluateDirectoryLoginChange(supabase, {
      actor: directoryActor(actor),
      linked: target ? directoryTarget(target) : null,
      email: changes.email === undefined ? target?.email ?? "new.person@fitdog.test" : changes.email,
      dashboardRole: (changes.role ?? target?.legacyRole ?? "groomer") as never,
      department: changes.department === undefined ? (target ? departmentLabelFor(target) : "Grooming") : changes.department,
      settingPassword: changes.password ?? false
    });

  assert.match(String(await change(PEOPLE.groomingManager, PEOPLE.groomingManager, { role: "owner_admin" })), /your own role/, "manager self-promotion to Super Admin");
  assert.match(String(await change(PEOPLE.groomingManager, PEOPLE.groomingManager, { role: "manager_admin" })), /your own role/, "manager self-promotion to Admin");
  assert.match(String(await change(PEOPLE.groomingManager, PEOPLE.groomingManager, { department: "Dog Handlers" })), /your own role or departments/, "manager self department change");
  assert.match(String(await change(PEOPLE.admin, PEOPLE.admin, { role: "owner_admin" })), /your own role/, "admin self-promotion");
  assert.equal(await change(PEOPLE.groomingManager, PEOPLE.groomingManager, {}), null, "managers can still save their own unchanged profile");
  assert.match(String(await change(PEOPLE.groomingManager, PEOPLE.groomer, { role: "manager_admin" })), /cannot assign that role/, "manager grants Admin");
  assert.match(String(await change(PEOPLE.groomingManager, PEOPLE.groomer, { role: "assistant_manager" })), /cannot assign that role/, "manager grants Management");
  assert.equal(await change(PEOPLE.groomingManager, PEOPLE.groomer, { role: "trainer", department: "Training" }), null, "managers keep operational role edits");
  assert.match(String(await change(PEOPLE.groomingManager, PEOPLE.admin, { password: true })), /Admin or Super Admin/, "manager resets an Admin password");
  assert.match(String(await change(PEOPLE.groomingManager, PEOPLE.admin, { email: "attacker@fitdog.test" })), /Admin or Super Admin/, "manager changes an Admin login email");
  assert.equal(await change(PEOPLE.groomingManager, PEOPLE.admin, {}), null, "unchanged admin profile edits still save");
  assert.match(String(await change(PEOPLE.groomingManager, PEOPLE.superAdmin, { password: true })), /Only Super Admin/, "manager resets a Super Admin password");
  assert.match(String(await change(PEOPLE.admin, PEOPLE.superAdmin, { email: "x@fitdog.test" })), /Only Super Admin/, "admin changes a Super Admin login");
  assert.match(String(await change(PEOPLE.admin, PEOPLE.groomer, { role: "owner_admin" })), /Super Admin role|cannot assign/, "admin grants Super Admin");
  assert.equal(await change(PEOPLE.admin, PEOPLE.groomer, { role: "manager_admin", department: "Admin" }), null, "Admin may grant Admin");
  assert.match(String(await change(PEOPLE.groomingManager, null, { role: "owner_admin", password: true })), /cannot assign that role/, "manager creates a Super Admin login");
  assert.equal(await change(PEOPLE.groomingManager, null, { role: "groomer", password: true }), null, "manager creates a groomer login");
  assert.match(
    String(
      await evaluateDirectoryLoginChange(countOnlySupabase(1), {
        actor: directoryActor(PEOPLE.superAdmin),
        linked: directoryTarget(PEOPLE.superAdmin),
        email: PEOPLE.superAdmin.email,
        dashboardRole: "manager_admin",
        department: "Admin",
        settingPassword: false
      })
    ),
    /last active Super Admin/,
    "the last Super Admin cannot be downgraded from the directory"
  );

  const remove = (actor: Person, target: Person) =>
    evaluateDirectoryLoginDelete(supabase, { actor: directoryActor(actor), targets: [directoryTarget(target)] });
  assert.match(String(await remove(PEOPLE.groomingManager, PEOPLE.admin)), /Admin or Super Admin/, "manager deletes an Admin login");
  assert.match(String(await remove(PEOPLE.groomingManager, PEOPLE.groomingManager)), /your own login/, "manager deletes own login");
  assert.match(String(await remove(PEOPLE.admin, PEOPLE.superAdmin)), /Only Super Admin/, "admin deletes a Super Admin login");
  assert.equal(await remove(PEOPLE.admin, PEOPLE.groomer), null, "admin removes a groomer login");
}

function departmentLabelFor(p: Person) {
  const labels: Record<string, string> = {
    grooming: "Grooming",
    daycare: "Dog Handlers",
    training: "Training",
    front_desk: "Front Desk",
    management: "Management",
    admin: "Admin"
  };
  return labels[p.departments[0] ?? ""] ?? null;
}

async function testSuperAdminConfiguration() {
  // 5. Super Admin manages global configuration, and 14. every privileged change is audited.
  const db = populatedDb();
  const access = fakeAccessControl();
  const sa = actorFor(PEOPLE.superAdmin);
  const deps = handlerDeps(db, sa, { accessControl: access.port });
  for (const view of [...SUPER_ADMIN_VIEWS, "settings", "audit", "departments"] as LeadershipView[]) {
    await expectStatus(await handleLeadershipGet(request(`/api/admin/team-engagement?view=${view}`), deps), 200, `Super Admin ${view}`);
  }
  const post = (body: Record<string, unknown>, status = 200) =>
    handleLeadershipPost(request("/api/admin/team-engagement", { body }), deps).then((response) => expectStatus(response, status, String(body.action)));

  await post({ action: "save_features", revision: 0, value: { programs: false }, reason: "Pausing programs during the holiday rush." });
  await post({ action: "save_features", revision: 0, value: { programs: true }, reason: "Stale revision should conflict." }, 409);
  await post({ action: "save_ai_policy", revision: 0, value: { enabled: true, autoApproveThreshold: 0.9 }, reason: "Raise the auto-approval bar." });
  await post({ action: "save_retention", revision: 0, value: { rejectedBarkOutDays: 90 }, reason: "Shorter retention for rejected posts." });
  await post({ action: "save_features", revision: 1, value: { programs: true }, reason: "Programs are back on." });
  await post({ action: "set_role_permission", role: "management", permission: "engagement.export", enabled: true, reason: "Managers export their team reports." });
  await post({ action: "set_role_permission", role: "admin", permission: "engagement.manage_permissions", enabled: true, reason: "Should stay locked." }, 403);
  await post({ action: "change_role", userId: PEOPLE.groomer.id, role: "management", reason: "Promoted to grooming lead." });
  await post({ action: "change_role", userId: PEOPLE.groomer2.id, role: "admin", reason: "Covering operations as an Admin." }, 400);
  await post({ action: "change_role", userId: PEOPLE.groomer2.id, role: "admin", reason: "Covering operations as an Admin.", confirmName: PEOPLE.groomer2.name });
  await post({ action: "change_role", userId: PEOPLE.superAdmin.id, role: "admin", reason: "Changing my own role.", confirmName: PEOPLE.superAdmin.name }, 403);
  await post({ action: "assign_department_manager", key: "training", userId: PEOPLE.daycareManager.id });
  await post({ action: "assign_department_manager", key: "training", userId: PEOPLE.groomer.id }, 400);
  await post({ action: "run_retention_purge", confirmation: "nope", reason: "Cleanup." }, 400);
  await post({ action: "run_retention_purge", confirmation: "PURGE", reason: "Quarterly retention cleanup." });

  assert.deepEqual(
    access.roleChanges.map((change) => [change.targetUserId, change.nextPrimaryRole]),
    [
      [PEOPLE.groomer.id, "management"],
      [PEOPLE.groomer2.id, "admin"]
    ]
  );
  assert.deepEqual(access.permissionChanges, [{ role: "management", permission: "engagement.export", enabled: true }]);

  const expectAudit = (action: string, category: string, check?: (row: Record<string, unknown>) => void) => {
    const rows = auditRows(db, action);
    assert.ok(rows.length > 0, `audit row for ${action}`);
    for (const row of rows) {
      assert.equal(row.category, category, `${action} category`);
      assert.equal(row.actor_user_id, PEOPLE.superAdmin.id, `${action} actor`);
      assert.equal(row.actor_role, "super_admin", `${action} actor role`);
      assert.ok(row.occurred_at, `${action} timestamp`);
      check?.(row);
    }
  };
  expectAudit("settings.features", "security", (row) => {
    assert.ok(row.reason, "feature changes need a reason");
    assert.ok(row.previous_value && row.new_value, "feature changes keep previous and new values");
  });
  expectAudit("settings.ai_policy", "configuration");
  expectAudit("settings.retention", "security");
  expectAudit("permission.change", "access", (row) => {
    assert.deepEqual(row.previous_value, { enabled: false });
    assert.deepEqual(row.new_value, { enabled: true });
  });
  expectAudit("role.change", "access", (row) => {
    assert.ok(row.reason && row.target_id && row.previous_value && row.new_value);
  });
  expectAudit("department.manager_assign", "access");
  expectAudit("retention.purge", "security");
  assert.equal(auditRows(db, "role.change").length, 2, "refused role changes are not recorded as changes");

  // Audit history is append-only for everyone, and nothing in the API edits it.
  await assert.rejects(
    db.commit([{ op: "update", table: "team_engagement_audit_events", match: { action: "role.change" }, set: { reason: "edited" } }]),
    /not allowed/
  );
  await assert.rejects(db.commit([{ op: "delete", table: "team_engagement_audit_events", match: { action: "role.change" } }]), /not allowed/);
  assert.ok(!ALL_ACTIONS.some((action) => action.includes("audit")), "no API action edits audit history");

  // Admin configuration changes are audited too.
  const adminDeps = handlerDeps(db, actorFor(PEOPLE.admin));
  await expectStatus(
    await handleLeadershipPost(request("/api/admin/team-engagement", { body: { action: "save_department", key: "grooming", description: "Grooming salon team", recognitionEnabled: true } }), adminDeps),
    200,
    "admin saves a department"
  );
  const departmentAudit = auditRows(db, "department.update")[0]!;
  assert.equal(departmentAudit.actor_user_id, PEOPLE.admin.id);
  assert.equal(departmentAudit.category, "configuration");
}

async function testExports() {
  // 15. Exports need `engagement.export` plus the permission for that data.
  const db = populatedDb();
  for (const type of Object.keys(EXPORT_TYPES)) {
    await expectStatus(await handleExport(request(`/api/admin/team-engagement/export?type=${type}`), handlerDeps(db, actorFor(PEOPLE.groomingManager))), 403, `manager export ${type}`);
  }
  const exporter = handlerDeps(db, actorFor(PEOPLE.groomingManager, { addPermissions: ["engagement.export"] }));
  await expectStatus(await handleExport(request("/api/admin/team-engagement/export?type=audit"), exporter), 403, "manager audit export without audit access");
  await expectStatus(await handleExport(request("/api/admin/team-engagement/export?type=bark_outs&department=daycare"), exporter), 403, "manager export outside scope");
  const ok = await handleExport(request("/api/admin/team-engagement/export?type=bark_outs&from=2026-11-01&to=2026-11-13"), exporter);
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get("content-disposition") ?? "", /attachment/);
  assert.equal(ok.headers.get("cache-control"), "no-store");
  await flushAsyncWrites();
  assert.ok(auditRows(db, "access.denied").some((row) => (row.new_value as { reason?: string }).reason === "missing_export_permission"), "refused exports are recorded");

  const adminExport = await handleExport(request("/api/admin/team-engagement/export?type=bark_outs&from=2026-11-01&to=2026-11-13"), handlerDeps(db, actorFor(PEOPLE.admin)));
  const csv = await adminExport.text();
  assert.ok(csv.includes("'=HYPERLINK"), "spreadsheet formulas are neutralized");
  assert.ok(!/(^|,)=HYPERLINK/m.test(csv));
  await expectStatus(await handleExport(request("/api/admin/team-engagement/export?type=audit"), handlerDeps(db, actorFor(PEOPLE.admin))), 200, "admin audit export");
  const exportAudits = db.tables.team_engagement_audit_events.filter((row) => String(row.action).startsWith("export."));
  assert.ok(exportAudits.some((row) => row.action === "export.bark_outs" && row.actor_user_id === PEOPLE.admin.id && (row.new_value as { rows: number }).rows >= 1));
  assert.ok(exportAudits.some((row) => row.action === "export.audit"));
  assert.ok(exportAudits.every((row) => row.category === "export"));
  await expectStatus(await handleExport(request("/api/admin/team-engagement/export?type=passwords"), handlerDeps(db, actorFor(PEOPLE.admin))), 400, "unknown export type");
}

async function testSensitiveDetails() {
  const db = populatedDb();
  db.tables.team_engagement_reports.push({
    id: "ffffffff-0000-4000-8000-000000000001",
    bark_out_id: IDS.groomingPending,
    reporter_user_id: PEOPLE.groomer2.id,
    reporter_name: PEOPLE.groomer2.name,
    reason: "Feels like a dig at me.",
    status: "open",
    resolution_note: null,
    resolved_by_user_id: null,
    resolved_by_name: null,
    resolved_at: null,
    created_at: "2026-11-11T17:00:00.000Z",
    updated_at: "2026-11-11T17:00:00.000Z"
  });
  db.tables.team_engagement_bark_outs.find((row) => row.id === IDS.groomingPending)!.open_report_count = 1;
  const managerQueue = await moderationQueue(serviceContextFor(db, actorFor(PEOPLE.groomingManager)), {});
  assert.equal(managerQueue.items[0]!.reports[0]!.reporterName, "A team member", "Management never sees who filed a concern");
  const adminQueue = await moderationQueue(serviceContextFor(db, actorFor(PEOPLE.admin)), {});
  assert.equal(adminQueue.items.find((item) => item.id === IDS.groomingPending)!.reports[0]!.reporterName, PEOPLE.groomer2.name);

  const employeeFeed = await handleParticipantGet(request("/api/admin/bark-outs?view=feed"), handlerDeps(db, actorFor(PEOPLE.handler)));
  const feedText = await employeeFeed.text();
  for (const hidden of ["content_fingerprint", "moderation_outcome", "Feels like a dig", "Private leadership note", "@fitdog.test"]) {
    assert.ok(!feedText.includes(hidden), `employee feed never includes ${hidden}`);
  }
  const home = await (await handleParticipantGet(request("/api/admin/bark-outs?view=home"), handlerDeps(db, actorFor(PEOPLE.handler)))).text();
  assert.ok(!home.includes("@fitdog.test"), "recipient pickers never include emails");
  assert.ok(!home.includes("Private leadership note"), "leadership-only development notes stay private");

  const managerStaff = await (await handleLeadershipGet(request("/api/admin/team-engagement?view=staff"), handlerDeps(db, actorFor(PEOPLE.groomingManager)))).text();
  assert.ok(!managerStaff.includes("@fitdog.test"), "the staff directory never includes emails");
  assert.ok(!/count|rank|score/i.test(Object.keys(JSON.parse(managerStaff).items[0]).join(",")), "no recognition counts, ranks, or scores per person");
}

async function main() {
  await testTabVisibility();
  await testMiddleware();
  await testApiRefusals();
  await testImpersonation();
  await testManagementScope();
  await testAdminLimits();
  await testNoSelfEscalation();
  await testSuperAdminConfiguration();
  await testExports();
  await testSensitiveDetails();
  assert.ok(NOW instanceof Date);
  void buildUserAccess;
  console.log("team engagement access tests passed");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
