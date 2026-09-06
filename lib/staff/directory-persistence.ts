/**
 * Staff Directory persistence rules.
 *
 * The local roster is the source of truth. External APIs and shared JSON blobs
 * may add or update matching people. They must never delete anyone.
 * Only an explicit admin archive/delete removes a staff member from the roster.
 */

export type StaffDirectoryStatus = "Active" | "Inactive";

export type StaffDirectoryRecord = {
  id: string;
  name: string;
  role: string | null;
  department: string;
  email: string | null;
  phone: string | null;
  status: StaffDirectoryStatus;
  notes: string | null;
  checklist_items?: string[] | null;
  admin_user_id: string | null;
  dashboard_role: string | null;
  external_id: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ExternalStaffSyncInput = {
  id?: string | null;
  external_id?: string | null;
  name: string;
  role?: string | null;
  department?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: StaffDirectoryStatus | null;
  notes?: string | null;
  checklist_items?: string[] | null;
  admin_user_id?: string | null;
  dashboard_role?: string | null;
};

export type AdminUserSeed = {
  id: string;
  full_name: string;
  email: string;
  role: string | null;
  status: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type StaffDirectorySyncResult = {
  members: StaffDirectoryRecord[];
  added: number;
  updated: number;
  unchanged: number;
  skippedDeletions: number;
  warning: string | null;
  skipped: boolean;
  reason: "ok" | "api_failed" | "partial_response" | "empty_response";
};

export const PLACEHOLDER_DIRECTORY_ID_PREFIX = "default-staff-";

const DEFAULT_DEPARTMENT = "Front Desk";

export function normalizeStaffEmail(value: string | null | undefined) {
  const email = String(value ?? "").trim().toLowerCase();
  return email || null;
}

export function isPlaceholderDirectoryMember(
  member: Pick<StaffDirectoryRecord, "id" | "email" | "admin_user_id" | "phone"> & { external_id?: string | null }
) {
  if (!String(member.id || "").startsWith(PLACEHOLDER_DIRECTORY_ID_PREFIX)) return false;
  return !member.email && !member.admin_user_id && !member.phone && !member.external_id;
}

export function isVisibleStaffMember(member: Pick<StaffDirectoryRecord, "deleted_at">) {
  return !member.deleted_at;
}

export function departmentFromDashboardRole(role?: string | null) {
  if (role === "team_leader") return "Team Lead";
  if (role === "front_desk_coordinator") return DEFAULT_DEPARTMENT;
  if (role === "groomer") return "Grooming";
  if (role === "trainer") return "Training";
  if (role === "daycare") return "Daycare";
  if (role === "driver") return "Transportation";
  if (role === "hiker") return "Hikers";
  if (role === "marketing") return "Marketing";
  if (role === "owner_admin" || role === "manager_admin" || role === "assistant_manager") return "Management";
  return null;
}

export function memberFromAdminUser(user: AdminUserSeed, now = new Date().toISOString()): StaffDirectoryRecord {
  const email = normalizeStaffEmail(user.email);
  const inactive = String(user.status || "").toLowerCase() === "disabled";
  return {
    id: `admin-user-${user.id}`,
    name: String(user.full_name || email || "Staff").trim() || "Staff",
    role: null,
    department: departmentFromDashboardRole(user.role) || DEFAULT_DEPARTMENT,
    email,
    phone: null,
    status: inactive ? "Inactive" : "Active",
    notes: null,
    checklist_items: null,
    admin_user_id: user.id,
    dashboard_role: user.role,
    external_id: null,
    deleted_at: null,
    deleted_by: null,
    created_at: user.created_at || now,
    updated_at: user.updated_at || now
  };
}

function cloneMember(member: StaffDirectoryRecord): StaffDirectoryRecord {
  return {
    ...member,
    checklist_items: member.checklist_items ? [...member.checklist_items] : member.checklist_items ?? null
  };
}

export function staffIdentityKeys(member: {
  id?: string | null;
  external_id?: string | null;
  admin_user_id?: string | null;
  email?: string | null;
}) {
  const keys: string[] = [];
  if (member.external_id) keys.push(`ext:${String(member.external_id).trim()}`);
  if (member.admin_user_id) keys.push(`admin:${member.admin_user_id}`);
  const email = normalizeStaffEmail(member.email);
  if (email) keys.push(`email:${email}`);
  if (member.id) keys.push(`id:${member.id}`);
  return keys;
}

function indexRoster(members: StaffDirectoryRecord[]) {
  const byKey = new Map<string, StaffDirectoryRecord>();
  for (const member of members) {
    for (const key of staffIdentityKeys(member)) {
      byKey.set(key, member);
    }
  }
  return byKey;
}

export function findMatchingStaff<T extends { id?: string | null; external_id?: string | null; admin_user_id?: string | null; email?: string | null }>(
  members: StaffDirectoryRecord[],
  incoming: T
) {
  const index = indexRoster(members);
  for (const key of staffIdentityKeys(incoming)) {
    const hit = index.get(key);
    if (hit) return hit;
  }
  return null;
}

function applyAllowedUpdates(existing: StaffDirectoryRecord, incoming: ExternalStaffSyncInput, now: string): StaffDirectoryRecord {
  const next = cloneMember(existing);
  if (incoming.name?.trim()) next.name = incoming.name.trim();
  if (incoming.role !== undefined) next.role = incoming.role?.trim() || null;
  if (incoming.department?.trim()) next.department = incoming.department.trim();
  if (incoming.email !== undefined) next.email = normalizeStaffEmail(incoming.email);
  if (incoming.phone !== undefined) next.phone = incoming.phone?.trim() || null;
  if (incoming.status === "Active" || incoming.status === "Inactive") next.status = incoming.status;
  if (incoming.notes !== undefined) next.notes = incoming.notes?.trim() || null;
  if (incoming.checklist_items !== undefined) next.checklist_items = incoming.checklist_items;
  if (incoming.admin_user_id) next.admin_user_id = incoming.admin_user_id;
  if (incoming.dashboard_role !== undefined) next.dashboard_role = incoming.dashboard_role;
  if (incoming.external_id) next.external_id = incoming.external_id;
  next.updated_at = now;
  return next;
}

function recordFromExternal(incoming: ExternalStaffSyncInput, now: string): StaffDirectoryRecord {
  const id = String(incoming.id || incoming.external_id || incoming.admin_user_id || `staff-${now}`).trim();
  return {
    id,
    name: incoming.name.trim(),
    role: incoming.role?.trim() || null,
    department: incoming.department?.trim() || departmentFromDashboardRole(incoming.dashboard_role) || DEFAULT_DEPARTMENT,
    email: normalizeStaffEmail(incoming.email),
    phone: incoming.phone?.trim() || null,
    status: incoming.status === "Inactive" ? "Inactive" : "Active",
    notes: incoming.notes?.trim() || null,
    checklist_items: incoming.checklist_items ?? null,
    admin_user_id: incoming.admin_user_id ?? null,
    dashboard_role: incoming.dashboard_role ?? null,
    external_id: incoming.external_id ?? null,
    deleted_at: null,
    deleted_by: null,
    created_at: now,
    updated_at: now
  };
}

export function isSuspiciouslyPartialStaffSync(existingCount: number, incomingCount: number) {
  if (existingCount < 8) return incomingCount === 0;
  return incomingCount < Math.max(2, Math.ceil(existingCount * 0.5));
}

/**
 * Additive upsert: update matches, insert new people, never remove anyone
 * who was absent from the payload.
 */
export function applyExternalStaffSync(
  existing: StaffDirectoryRecord[],
  incoming: ExternalStaffSyncInput[] | null,
  options?: { now?: string; failed?: boolean }
): StaffDirectorySyncResult {
  const now = options?.now ?? new Date().toISOString();
  const roster = existing.map(cloneMember);

  if (options?.failed || incoming === null) {
    return {
      members: roster,
      added: 0,
      updated: 0,
      unchanged: roster.length,
      skippedDeletions: roster.length,
      warning: "External staff sync failed; existing roster left unchanged.",
      skipped: true,
      reason: "api_failed"
    };
  }

  const visible = roster.filter(isVisibleStaffMember);
  if (incoming.length === 0 && visible.length > 0) {
    return {
      members: roster,
      added: 0,
      updated: 0,
      unchanged: roster.length,
      skippedDeletions: visible.length,
      warning: "External staff sync returned an empty list; existing roster left unchanged.",
      skipped: true,
      reason: "empty_response"
    };
  }

  const partial = isSuspiciouslyPartialStaffSync(visible.length, incoming.length);
  let added = 0;
  let updated = 0;
  let unchanged = 0;

  for (const row of incoming) {
    if (!row.name?.trim()) continue;
    const match = findMatchingStaff(roster, row);
    if (match) {
      if (match.deleted_at) {
        unchanged += 1;
        continue;
      }
      const next = applyAllowedUpdates(match, row, now);
      const index = roster.findIndex((member) => member.id === match.id);
      roster[index] = next;
      updated += 1;
    } else {
      roster.push(recordFromExternal(row, now));
      added += 1;
    }
  }

  const incomingKeys = new Set(incoming.flatMap((row) => staffIdentityKeys(row)));
  const skippedDeletions = visible.filter(
    (member) => !staffIdentityKeys(member).some((key) => incomingKeys.has(key))
  ).length;

  return {
    members: roster,
    added,
    updated,
    unchanged: Math.max(0, visible.length - updated),
    skippedDeletions,
    warning: partial
      ? `External staff sync returned ${incoming.length} of ${visible.length} local members; missing people were not deleted.`
      : null,
    skipped: false,
    reason: partial ? "partial_response" : "ok"
  };
}

export function jsonMemberToRecord(raw: unknown, now = new Date().toISOString()): StaffDirectoryRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const name = String(row.name ?? "").trim();
  const id = String(row.id ?? "").trim();
  if (!name || !id) return null;
  const record: StaffDirectoryRecord = {
    id,
    name,
    role: row.role ? String(row.role).trim() : null,
    department: String(row.department ?? DEFAULT_DEPARTMENT).trim() || DEFAULT_DEPARTMENT,
    email: normalizeStaffEmail(typeof row.email === "string" ? row.email : null),
    phone: row.phone ? String(row.phone).trim() : null,
    status: row.status === "Inactive" ? "Inactive" : "Active",
    notes: row.notes ? String(row.notes).trim() : null,
    checklist_items: Array.isArray(row.checklist_items)
      ? row.checklist_items.map((item) => String(item).trim()).filter(Boolean)
      : null,
    admin_user_id: row.admin_user_id ? String(row.admin_user_id) : null,
    dashboard_role: row.dashboard_role ? String(row.dashboard_role) : null,
    external_id: row.external_id ? String(row.external_id) : null,
    deleted_at: row.deleted_at ? String(row.deleted_at) : null,
    deleted_by: row.deleted_by ? String(row.deleted_by) : null,
    created_at: row.created_at ? String(row.created_at) : now,
    updated_at: row.updated_at ? String(row.updated_at) : now
  };
  if (isPlaceholderDirectoryMember(record)) return null;
  return record;
}

export function intentionallyDeletedStaffIds(activityLogs: Array<{ activity_type?: string | null; source_id?: string | null }>) {
  const ids = new Set<string>();
  for (const log of activityLogs) {
    if (log.activity_type === "staff_directory.deleted" && log.source_id) {
      ids.add(String(log.source_id));
    }
  }
  return ids;
}

export type RestoreStaffSources = {
  tableRows: StaffDirectoryRecord[];
  jsonMembers?: unknown;
  adminUsers?: AdminUserSeed[];
  activityLogs?: Array<{ activity_type?: string | null; source_id?: string | null }>;
  now?: string;
};

export type RestoreStaffResult = {
  members: StaffDirectoryRecord[];
  recoveredFromJson: number;
  recoveredFromAdminUsers: number;
  alreadyPresent: number;
};

/**
 * Rebuild the roster by unioning durable sources. Soft-deleted table rows and
 * explicitly admin-deleted JSON ids stay archived. Placeholders are ignored.
 */
export function restorePersistentStaffRoster(sources: RestoreStaffSources): RestoreStaffResult {
  const now = sources.now ?? new Date().toISOString();
  const deletedIds = intentionallyDeletedStaffIds(sources.activityLogs ?? []);
  const roster: StaffDirectoryRecord[] = [];

  for (const row of sources.tableRows) {
    roster.push(cloneMember(row));
  }

  let recoveredFromJson = 0;
  const jsonList = Array.isArray(sources.jsonMembers) ? sources.jsonMembers : [];
  for (const raw of jsonList) {
    const record = jsonMemberToRecord(raw, now);
    if (!record) continue;
    if (deletedIds.has(record.id)) continue;
    if (record.deleted_at) continue;
    const match = findMatchingStaff(roster, record);
    if (match) {
      if (match.deleted_at) continue;
      continue;
    }
    roster.push(record);
    recoveredFromJson += 1;
  }

  let recoveredFromAdminUsers = 0;
  for (const user of sources.adminUsers ?? []) {
    const email = normalizeStaffEmail(user.email);
    if (email?.endsWith("@demo.com")) continue;
    const seeded = memberFromAdminUser(user, now);
    const match = findMatchingStaff(roster, seeded);
    if (match) {
      if (match.deleted_at) continue;
      continue;
    }
    if (deletedIds.has(seeded.id) || (seeded.admin_user_id && deletedIds.has(seeded.admin_user_id))) continue;
    roster.push(seeded);
    recoveredFromAdminUsers += 1;
  }

  return {
    members: roster,
    recoveredFromJson,
    recoveredFromAdminUsers,
    alreadyPresent: sources.tableRows.length
  };
}

export function visibleStaffDirectory(members: StaffDirectoryRecord[]) {
  return members
    .filter(isVisibleStaffMember)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export function toPublicStaffDirectoryMember(member: StaffDirectoryRecord) {
  return {
    id: member.id,
    name: member.name,
    role: member.role,
    department: member.department,
    email: member.email,
    phone: member.phone,
    status: member.status,
    notes: member.notes,
    checklist_items: member.checklist_items ?? null,
    admin_user_id: member.admin_user_id,
    dashboard_role: member.dashboard_role,
    created_at: member.created_at,
    updated_at: member.updated_at
  };
}
