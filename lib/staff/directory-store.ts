import { isDemoEmail } from "@/lib/demo/constants";
import { listAdminUsers } from "@/lib/admin/users";
import type { StaffDirectoryMember } from "@/lib/staff/admin-ops";
import {
  applyExternalStaffSync,
  jsonMemberToRecord,
  restorePersistentStaffRoster,
  toPublicStaffDirectoryMember,
  visibleStaffDirectory,
  type ExternalStaffSyncInput,
  type StaffDirectoryRecord,
  type StaffDirectorySyncResult
} from "@/lib/staff/directory-persistence";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

const PAGE_SIZE = 1000;

function isMissingRelation(error: { code?: string; message?: string } | null) {
  return error?.code === "42P01" || error?.code === "PGRST205" || Boolean(error?.message?.includes("schema cache"));
}

function nowIso() {
  return new Date().toISOString();
}

function rowToRecord(row: Record<string, unknown>): StaffDirectoryRecord {
  const parsed = jsonMemberToRecord(row, nowIso());
  if (parsed) {
    return {
      ...parsed,
      deleted_at: row.deleted_at ? String(row.deleted_at) : null,
      deleted_by: row.deleted_by ? String(row.deleted_by) : null,
      external_id: row.external_id ? String(row.external_id) : null
    };
  }
  throw new Error("Invalid staff directory row.");
}

function recordToRow(member: StaffDirectoryRecord) {
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
    external_id: member.external_id,
    deleted_at: member.deleted_at,
    deleted_by: member.deleted_by,
    created_at: member.created_at,
    updated_at: member.updated_at
  };
}

async function selectAllStaffDirectoryRows(supabase: SupabaseClient): Promise<StaffDirectoryRecord[] | null> {
  const rows: StaffDirectoryRecord[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("staff_directory")
      .select(
        "id, name, role, department, email, phone, status, notes, checklist_items, admin_user_id, dashboard_role, external_id, deleted_at, deleted_by, created_at, updated_at"
      )
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      if (isMissingRelation(error)) return null;
      throw error;
    }
    const page = (data ?? []) as Record<string, unknown>[];
    for (const row of page) {
      try {
        rows.push(rowToRecord(row));
      } catch {
        // Skip malformed rows rather than dropping the roster.
      }
    }
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

async function upsertStaffDirectoryRows(supabase: SupabaseClient, members: StaffDirectoryRecord[]) {
  if (!members.length) return;
  for (let i = 0; i < members.length; i += 200) {
    const chunk = members.slice(i, i + 200).map(recordToRow);
    const { error } = await supabase.from("staff_directory").upsert(chunk, { onConflict: "id" });
    if (error) {
      if (isMissingRelation(error)) return;
      throw error;
    }
  }
}

export async function hydratePersistentStaffDirectory(
  supabase: SupabaseClient,
  sources?: { jsonMembers?: unknown; activityLogs?: Array<{ activity_type?: string | null; source_id?: string | null }> }
): Promise<{ members: StaffDirectoryRecord[]; recoveredFromJson: number; recoveredFromAdminUsers: number; tableAvailable: boolean }> {
  const tableRows = await selectAllStaffDirectoryRows(supabase);
  if (tableRows === null) {
    const restored = restorePersistentStaffRoster({
      tableRows: [],
      jsonMembers: sources?.jsonMembers,
      activityLogs: sources?.activityLogs,
      adminUsers: []
    });
    return { ...restored, tableAvailable: false };
  }

  let adminUsers: Array<{ id: string; full_name: string; email: string; role: string | null; status: string | null; created_at?: string | null; updated_at?: string | null }> = [];
  try {
    const users = await listAdminUsers(supabase);
    adminUsers = users
      .filter((user) => !isDemoEmail(user.email))
      .map((user) => ({
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        status: user.status,
        created_at: user.created_at,
        updated_at: user.updated_at
      }));
  } catch (error) {
    console.warn("[staff-directory] admin_users seed skipped:", error instanceof Error ? error.message : error);
  }

  const restored = restorePersistentStaffRoster({
    tableRows,
    jsonMembers: sources?.jsonMembers,
    activityLogs: sources?.activityLogs,
    adminUsers
  });

  const existingIds = new Set(tableRows.map((row) => row.id));
  const toInsert = restored.members.filter((member) => !member.deleted_at && !existingIds.has(member.id));
  if (toInsert.length) {
    await upsertStaffDirectoryRows(supabase, toInsert);
  }

  return { ...restored, tableAvailable: true };
}

export async function listVisibleStaffDirectory(
  supabase: SupabaseClient,
  sources?: { jsonMembers?: unknown; activityLogs?: Array<{ activity_type?: string | null; source_id?: string | null }> }
): Promise<StaffDirectoryMember[]> {
  const hydrated = await hydratePersistentStaffDirectory(supabase, sources);
  return visibleStaffDirectory(hydrated.members).map(toPublicStaffDirectoryMember) as StaffDirectoryMember[];
}

export async function insertStaffDirectoryRecord(supabase: SupabaseClient, member: StaffDirectoryMember) {
  const now = nowIso();
  const record: StaffDirectoryRecord = {
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
    external_id: null,
    deleted_at: null,
    deleted_by: null,
    created_at: member.created_at || now,
    updated_at: member.updated_at || now
  };
  await upsertStaffDirectoryRows(supabase, [record]);
  return record;
}

export async function updateStaffDirectoryRecord(supabase: SupabaseClient, member: StaffDirectoryMember) {
  const { data: existing, error: loadError } = await supabase
    .from("staff_directory")
    .select("external_id, deleted_at, deleted_by, created_at")
    .eq("id", member.id)
    .maybeSingle();
  if (loadError && !isMissingRelation(loadError)) throw loadError;
  if ((existing as { deleted_at?: string | null } | null)?.deleted_at) {
    throw new Error("Staff member not found.");
  }
  const record: StaffDirectoryRecord = {
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
    external_id: (existing as { external_id?: string | null } | null)?.external_id ?? null,
    deleted_at: null,
    deleted_by: null,
    created_at: member.created_at || (existing as { created_at?: string } | null)?.created_at || nowIso(),
    updated_at: member.updated_at || nowIso()
  };
  await upsertStaffDirectoryRows(supabase, [record]);
  return record;
}

export async function archiveStaffDirectoryRecord(supabase: SupabaseClient, id: string, actor: string | null) {
  const now = nowIso();
  const { data, error } = await supabase
    .from("staff_directory")
    .update({
      deleted_at: now,
      deleted_by: actor,
      updated_at: now
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();
  if (error) {
    if (isMissingRelation(error)) {
      throw new Error("Staff directory table is not available.");
    }
    throw error;
  }
  if (!data) throw new Error("Staff member not found.");
}

export async function findStaffDirectoryRecordById(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase.from("staff_directory").select("*").eq("id", id).maybeSingle();
  if (error) {
    if (isMissingRelation(error)) return null;
    throw error;
  }
  if (!data) return null;
  try {
    return rowToRecord(data as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function reviveMatchingArchivedStaff(
  supabase: SupabaseClient,
  input: { email?: string | null; admin_user_id?: string | null }
) {
  const email = input.email?.trim().toLowerCase() || null;
  if (!email && !input.admin_user_id) return null;

  const queries = [];
  if (email) {
    queries.push(
      supabase.from("staff_directory").select("*").not("deleted_at", "is", null).ilike("email", email).limit(1).maybeSingle()
    );
  }
  if (input.admin_user_id) {
    queries.push(
      supabase
        .from("staff_directory")
        .select("*")
        .not("deleted_at", "is", null)
        .eq("admin_user_id", input.admin_user_id)
        .limit(1)
        .maybeSingle()
    );
  }

  for (const pending of queries) {
    const { data, error } = await pending;
    if (error) {
      if (isMissingRelation(error)) return null;
      throw error;
    }
    if (!data) continue;
    const now = nowIso();
    const { error: reviveError } = await supabase
      .from("staff_directory")
      .update({ deleted_at: null, deleted_by: null, updated_at: now })
      .eq("id", (data as { id: string }).id);
    if (reviveError && !isMissingRelation(reviveError)) throw reviveError;
    try {
      return rowToRecord({ ...(data as Record<string, unknown>), deleted_at: null, deleted_by: null, updated_at: now });
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * External APIs may add/update. They must never archive or delete.
 * Failed or partial payloads leave the local roster intact.
 */
export async function syncExternalStaffIntoDirectory(
  supabase: SupabaseClient,
  fetchExternal: () => Promise<ExternalStaffSyncInput[] | null>
): Promise<StaffDirectorySyncResult> {
  const existing = (await selectAllStaffDirectoryRows(supabase)) ?? [];
  let incoming: ExternalStaffSyncInput[] | null;
  try {
    incoming = await fetchExternal();
  } catch (error) {
    console.warn("[staff-directory] external sync failed; roster unchanged", error);
    return applyExternalStaffSync(existing, null, { failed: true });
  }

  const result = applyExternalStaffSync(existing, incoming);
  if (result.skipped) {
    if (result.warning) console.warn("[staff-directory]", result.warning);
    return result;
  }
  if (result.warning) console.warn("[staff-directory]", result.warning);

  const existingById = new Map(existing.map((row) => [row.id, row]));
  const writes = result.members.filter((member) => {
    if (member.deleted_at) return false;
    const before = existingById.get(member.id);
    return !before || before.updated_at !== member.updated_at;
  });
  await upsertStaffDirectoryRows(supabase, writes);
  return result;
}
