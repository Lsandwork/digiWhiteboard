import { isDemoEmail } from "@/lib/demo/constants";
import type { AdminUserPublic } from "@/lib/admin/users";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export type CommissionTrainerOption = {
  id: string;
  full_name: string;
  email: string;
};

/** Active trainers eligible for commission ledger filters and CSV matching (excludes demo accounts). */
export function listCommissionTrainerOptions(
  users: Pick<AdminUserPublic, "id" | "full_name" | "email" | "role" | "status">[]
): CommissionTrainerOption[] {
  return users
    .filter((user) => user.role === "trainer" && user.status !== "disabled" && !isDemoEmail(user.email))
    .map((user) => ({ id: user.id, full_name: user.full_name, email: user.email }));
}

/** Trainers only — do not load the full admin_users table on the ledger GET. */
export async function listCommissionTrainersFromDb(
  supabase: SupabaseClient
): Promise<CommissionTrainerOption[]> {
  const { data, error } = await supabase
    .from("admin_users")
    .select("id, full_name, email, role, status")
    .eq("role", "trainer")
    .order("full_name", { ascending: true });
  if (error) return [];
  return listCommissionTrainerOptions((data ?? []) as AdminUserPublic[]);
}
