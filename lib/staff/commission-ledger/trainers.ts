import { isDemoEmail } from "@/lib/demo/constants";
import type { AdminUserPublic } from "@/lib/admin/users";
import { canListCommissionsViaPostgres, withCommissionPostgres } from "@/lib/staff/commission-ledger/list-via-postgres";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export type CommissionTrainerOption = {
  id: string;
  full_name: string;
  email: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isCommissionTrainerUserId(value: string | null | undefined): boolean {
  return Boolean(value && UUID_RE.test(value.trim()));
}

/** Encode a name-only trainer so the multi-select can filter without a user id. */
export function commissionTrainerNameOptionId(name: string): string {
  return `name:${name.trim()}`;
}

export function parseCommissionTrainerFilterValues(values: string[]): {
  trainerIds: string[];
  trainerNames: string[];
} {
  const trainerIds: string[] = [];
  const trainerNames: string[] = [];
  for (const raw of values) {
    const value = String(raw ?? "").trim();
    if (!value) continue;
    if (value.startsWith("name:")) {
      const name = value.slice(5).trim();
      if (name) trainerNames.push(name);
      continue;
    }
    if (isCommissionTrainerUserId(value)) {
      trainerIds.push(value);
      continue;
    }
    // Legacy / free-text selections fall back to name match.
    trainerNames.push(value);
  }
  return { trainerIds, trainerNames };
}

/** Active trainers eligible for commission ledger filters and CSV matching (excludes demo accounts). */
export function listCommissionTrainerOptions(
  users: Pick<AdminUserPublic, "id" | "full_name" | "email" | "role" | "status">[]
): CommissionTrainerOption[] {
  return users
    .filter((user) => user.role === "trainer" && user.status !== "disabled" && !isDemoEmail(user.email))
    .map((user) => ({ id: user.id, full_name: user.full_name, email: user.email }));
}

function normalizeTrainerName(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function mergeTrainerOptions(groups: CommissionTrainerOption[][]): CommissionTrainerOption[] {
  const byKey = new Map<string, CommissionTrainerOption>();
  for (const group of groups) {
    for (const trainer of group) {
      const name = normalizeTrainerName(trainer.full_name);
      if (!name || /^unassigned$/i.test(name)) continue;
      const id = isCommissionTrainerUserId(trainer.id) ? trainer.id : commissionTrainerNameOptionId(name);
      const key = isCommissionTrainerUserId(id) ? `id:${id}` : `name:${name.toLowerCase()}`;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, {
          id,
          full_name: name,
          email: trainer.email?.trim() || ""
        });
        continue;
      }
      if (!existing.email && trainer.email) {
        byKey.set(key, { ...existing, email: trainer.email.trim() });
      }
      // Prefer a real user id when we previously only had a name key.
      if (!isCommissionTrainerUserId(existing.id) && isCommissionTrainerUserId(id)) {
        byKey.delete(key);
        byKey.set(`id:${id}`, {
          id,
          full_name: name,
          email: trainer.email?.trim() || existing.email
        });
      }
    }
  }
  return [...byKey.values()].sort((a, b) => a.full_name.localeCompare(b.full_name));
}

function trainersFromLedgerRows(
  rows: Array<{ trainer_user_id?: string | null; trainer_name?: string | null; trainer_email?: string | null }>
): CommissionTrainerOption[] {
  return mergeTrainerOptions([
    rows.map((row) => {
      const name = normalizeTrainerName(row.trainer_name);
      const id = isCommissionTrainerUserId(row.trainer_user_id)
        ? String(row.trainer_user_id)
        : commissionTrainerNameOptionId(name || "Unknown");
      return {
        id,
        full_name: name || "Unknown",
        email: String(row.trainer_email ?? "").trim()
      };
    })
  ]);
}

async function listDistinctTrainersViaPostgres(): Promise<CommissionTrainerOption[]> {
  return withCommissionPostgres(async (client) => {
    const result = await client.query<{
      trainer_user_id: string | null;
      trainer_name: string | null;
      trainer_email: string | null;
    }>(
      `select distinct on (lower(coalesce(nullif(trim(trainer_name), ''), trainer_user_id::text)))
         trainer_user_id,
         trainer_name,
         trainer_email
       from package_commission_records
       where archived_at is null
         and coalesce(nullif(trim(trainer_name), ''), '') <> ''
         and lower(trim(trainer_name)) <> 'unassigned'
       order by lower(coalesce(nullif(trim(trainer_name), ''), trainer_user_id::text)), trainer_name
       limit 250`
    );
    return trainersFromLedgerRows(result.rows);
  }, { statementTimeoutMs: 2_500, queryTimeoutMs: 3_000, connectionTimeoutMs: 1_000 });
}

async function listDistinctTrainersViaRest(supabase: SupabaseClient): Promise<CommissionTrainerOption[]> {
  const { data, error } = await supabase
    .from("package_commission_records")
    .select("trainer_user_id, trainer_name, trainer_email")
    .is("archived_at", null)
    .neq("trainer_name", "Unassigned")
    .order("trainer_name", { ascending: true })
    .limit(400);
  if (error) return [];
  return trainersFromLedgerRows((data ?? []) as Array<{
    trainer_user_id?: string | null;
    trainer_name?: string | null;
    trainer_email?: string | null;
  }>);
}

/** Trainers for ledger filters — admin trainer users plus distinct ledger names. */
export async function listCommissionTrainersFromDb(
  supabase: SupabaseClient
): Promise<CommissionTrainerOption[]> {
  const { data, error } = await supabase
    .from("admin_users")
    .select("id, full_name, email, role, status")
    .eq("role", "trainer")
    .order("full_name", { ascending: true });
  const fromUsers = error ? [] : listCommissionTrainerOptions((data ?? []) as AdminUserPublic[]);

  let fromLedger: CommissionTrainerOption[] = [];
  try {
    fromLedger = canListCommissionsViaPostgres()
      ? await listDistinctTrainersViaPostgres()
      : await listDistinctTrainersViaRest(supabase);
  } catch {
    try {
      fromLedger = await listDistinctTrainersViaRest(supabase);
    } catch {
      fromLedger = [];
    }
  }

  return mergeTrainerOptions([fromUsers, fromLedger]);
}

/** Merge API trainers with trainers visible on the current ledger page (UI safety net). */
export function mergeCommissionTrainerOptions(
  ...groups: Array<CommissionTrainerOption[] | undefined | null>
): CommissionTrainerOption[] {
  return mergeTrainerOptions(groups.map((group) => group ?? []));
}
