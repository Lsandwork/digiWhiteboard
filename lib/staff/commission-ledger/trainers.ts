import { isDemoEmail } from "@/lib/demo/constants";
import type { AdminUserPublic } from "@/lib/admin/users";

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
