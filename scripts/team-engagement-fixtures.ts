/**
 * Shared fixtures for the Team Engagement tests: real role defaults, real actor and directory builders, and the
 * in-memory database that enforces the same constraints as migration 103.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildUserAccess, type DepartmentKey, type PermissionKey, type RoleKey, type UserAccess } from "@/lib/admin/permissions";
import type { AdminSession } from "@/lib/admin/session";
import { buildEngagementActor, type EngagementContext } from "@/lib/team-engagement/authorize";
import type { AccessControlPort, EngagementNotification, OperationsSnapshot, ServiceContext } from "@/lib/team-engagement/context";
import { buildEngagementDirectory, type EngagementDirectory } from "@/lib/team-engagement/directory";
import type { EngagementHandlerDeps } from "@/lib/team-engagement/http";
import { createMemoryEngagementDb, type MemoryEngagementDb } from "@/lib/team-engagement/memory-db";
import type { ModerationAi } from "@/lib/team-engagement/moderation";
import { loadEngagementSettings } from "@/lib/team-engagement/settings";
import type { EngagementActor } from "@/lib/team-engagement/types";

export const NOW = new Date("2026-11-13T19:00:00.000Z");

export type Person = {
  id: string;
  name: string;
  email: string;
  legacyRole: string;
  primaryRole: RoleKey;
  departments: DepartmentKey[];
  managed?: DepartmentKey[];
  active?: boolean;
};

function person(n: number, name: string, legacyRole: string, primaryRole: RoleKey, departments: DepartmentKey[], extra: Partial<Person> = {}): Person {
  const id = `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const email = `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@fitdog.test`;
  return { id, name, email, legacyRole, primaryRole, departments, ...extra };
}

export const PEOPLE = {
  superAdmin: person(1, "Sky Owner", "owner_admin", "super_admin", []),
  superAdmin2: person(2, "Sage Owner", "owner_admin", "super_admin", []),
  admin: person(3, "Avery Admin", "manager_admin", "admin", ["admin"]),
  admin2: person(4, "Ari Admin", "manager_admin", "admin", ["admin"]),
  groomingManager: person(5, "Morgan Lead", "assistant_manager", "management", ["management"], { managed: ["grooming"] }),
  daycareManager: person(6, "Devon Lead", "assistant_manager", "management", ["management"], { managed: ["daycare"] }),
  groomer: person(7, "Gale Groomer", "groomer", "groomer", ["grooming"]),
  groomer2: person(8, "Glen Groomer", "groomer", "groomer", ["grooming"]),
  handler: person(9, "Hana Handler", "daycare", "daycare", ["daycare"]),
  trainer: person(10, "Tate Trainer", "trainer", "trainer", ["training"]),
  frontDesk: person(11, "Fern Desk", "front_desk_coordinator", "front_desk_coordinator", ["front_desk"]),
  teamLeader: person(12, "Toby Leader", "team_leader", "team_leader", ["daycare"]),
  formerGroomer: person(13, "Fay Former", "groomer", "groomer", ["grooming"], { active: false })
} satisfies Record<string, Person>;

export type PersonKey = keyof typeof PEOPLE;

/** Standard (non-leadership) dashboard roles. None of them may open Manage Team Engagement. */
export const STANDARD_LEGACY_ROLES = [
  "front_desk_coordinator",
  "team_leader",
  "groomer",
  "trainer",
  "daycare",
  "driver",
  "hiker",
  "overnight",
  "maintenance",
  "staff",
  "marketing",
  "viewer"
];

export function accessFor(p: Person, overrides: { addPermissions?: PermissionKey[] } = {}): UserAccess {
  const access = buildUserAccess({ userId: p.id, email: p.email, name: p.name, primaryRole: p.primaryRole, departments: p.departments });
  if (overrides.addPermissions?.length) {
    return { ...access, permissions: [...new Set([...access.permissions, ...overrides.addPermissions])] };
  }
  return access;
}

export function actorFor(p: Person, options: { impersonated?: boolean; addPermissions?: PermissionKey[] } = {}): EngagementActor {
  return buildEngagementActor({
    identity: { userId: p.id, name: p.name, email: p.email, legacyRole: p.legacyRole, status: p.active === false ? "disabled" : "active" },
    access: accessFor(p, options),
    managedDepartments: p.managed ?? [],
    impersonated: options.impersonated ?? false
  });
}

export function buildDirectory(): EngagementDirectory {
  const people = Object.values(PEOPLE) as Person[];
  return buildEngagementDirectory({
    users: people.map((p) => ({ id: p.id, full_name: p.name, email: p.email, role: p.legacyRole, status: p.active === false ? "disabled" : "active" })),
    accessMap: Object.fromEntries(people.map((p) => [p.id, accessFor(p)])),
    staff: []
  });
}

export function seededDb(): MemoryEngagementDb {
  const people = Object.values(PEOPLE) as Person[];
  return createMemoryEngagementDb({
    team_engagement_department_managers: people.flatMap((p) =>
      (p.managed ?? []).map((key) => ({
        department_key: key,
        manager_user_id: p.id,
        assigned_by_user_id: PEOPLE.superAdmin.id,
        assigned_by_name: PEOPLE.superAdmin.name,
        created_at: "2026-10-01T16:00:00.000Z"
      }))
    )
  });
}

export type RoleChangeCall = { targetUserId: string; nextPrimaryRole: RoleKey; reason: string; actorId: string };

/** Records role-matrix and role changes instead of writing to RuffOps' user tables. */
export function fakeAccessControl() {
  const roleChanges: RoleChangeCall[] = [];
  const permissionChanges: { role: RoleKey; permission: string; enabled: boolean }[] = [];
  const matrix: Record<string, Record<string, boolean>> = {};
  const port: AccessControlPort = {
    async changePrimaryRole({ targetUserId, nextPrimaryRole, reason, actor }) {
      roleChanges.push({ targetUserId, nextPrimaryRole, reason, actorId: actor.userId });
      const previous = (Object.values(PEOPLE) as Person[]).find((p) => p.id === targetUserId)?.primaryRole ?? "staff";
      return { previousRole: previous, nextRole: nextPrimaryRole };
    },
    async setRolePermission({ role, permission, enabled }) {
      const previous = matrix[role]?.[permission] === true;
      matrix[role] = { ...(matrix[role] ?? {}), [permission]: enabled };
      permissionChanges.push({ role, permission, enabled });
      return { previous, next: enabled };
    },
    async loadRoleMatrix() {
      return matrix;
    },
    isPermissionLocked(role, permission) {
      return role === "admin" && ["engagement.manage_permissions", "engagement.configure_ai", "engagement.manage_security", "engagement.manage_integrations"].includes(permission);
    }
  };
  return { port, roleChanges, permissionChanges };
}

export type TestServiceContext = ServiceContext & { notifications: EngagementNotification[] };

export function serviceContextFor(
  db: MemoryEngagementDb,
  actor: EngagementActor,
  options: {
    directory?: EngagementDirectory;
    ai?: ModerationAi | null;
    accessControl?: AccessControlPort | null;
    operations?: OperationsSnapshot | null;
    now?: Date;
  } = {}
): TestServiceContext {
  const directory = options.directory ?? buildDirectory();
  const notifications: EngagementNotification[] = [];
  return {
    db,
    actor,
    storageReady: true,
    now: () => options.now ?? NOW,
    directory: async () => directory,
    settings: () => loadEngagementSettings(db),
    moderationAi: () => options.ai ?? null,
    aiConfigured: () => Boolean(options.ai?.configured()),
    operations: async () => options.operations ?? null,
    notify: async (notification) => {
      notifications.push(notification);
    },
    accessControl: options.accessControl ?? null,
    securityEvents: async () => [],
    loadAvatar: async () => null,
    notifications
  };
}

/** Counts reads so tests can prove a refused request never touched protected data. */
export function countingDb(db: MemoryEngagementDb) {
  const reads: string[] = [];
  const writes: string[] = [];
  const wrapped: MemoryEngagementDb = {
    get tables() {
      return db.tables;
    },
    missingTables: db.missingTables,
    commits: db.commits,
    select: (table, query) => {
      reads.push(table);
      return db.select(table, query);
    },
    commit: (ops) => {
      writes.push(...ops.map((op) => `${op.op}:${op.table}`));
      return db.commit(ops);
    },
    purge: (plan, audit) => db.purge(plan, audit),
    tableStatus: () => db.tableStatus()
  };
  return { db: wrapped, reads, writes };
}

export function handlerDeps(
  db: MemoryEngagementDb,
  actor: EngagementActor,
  options: Parameters<typeof serviceContextFor>[2] = {}
): EngagementHandlerDeps & { contexts: TestServiceContext[] } {
  const contexts: TestServiceContext[] = [];
  const session: AdminSession = { email: actor.email, adminUserId: actor.userId, role: actor.legacyRole };
  const context: EngagementContext = { session, supabase: {} as SupabaseClient, db, actor, storageReady: true };
  return {
    contexts,
    loadContext: async () => ({ ok: true, context }),
    serviceContext: () => {
      const ctx = serviceContextFor(db, actor, options);
      contexts.push(ctx);
      return ctx;
    }
  };
}

export function request(path: string, init: { method?: string; body?: unknown } = {}) {
  return new Request(`https://www.fitdog.ruffops.com${path}`, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: init.body === undefined ? undefined : { "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body)
  });
}

export async function flushAsyncWrites() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

export function auditRows(db: MemoryEngagementDb, action?: string) {
  return db.tables.team_engagement_audit_events.filter((row) => !action || row.action === action);
}
