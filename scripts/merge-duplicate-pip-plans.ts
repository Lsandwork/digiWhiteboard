/**
 * One-shot: load PIP plans, merge open duplicates for the same employee, persist.
 *
 *   npx tsx scripts/merge-duplicate-pip-plans.ts
 */
import { loadEnvFiles } from "./load-env-local";

loadEnvFiles();

import { getServiceSupabase } from "@/lib/supabase/server";
import { listPipPlans, normalizePipEmployeeKey } from "@/lib/hr/pip";

async function main() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  }

  const supabase = getServiceSupabase();
  const plans = await listPipPlans(supabase);
  const open = plans.filter((plan) => plan.status === "Active" || plan.status === "On Hold");
  const byKey = new Map<string, typeof open>();
  for (const plan of open) {
    const key = normalizePipEmployeeKey(plan.employee_name) || plan.id;
    const list = byKey.get(key) ?? [];
    list.push(plan);
    byKey.set(key, list);
  }

  console.log(
    JSON.stringify(
      {
        total: plans.length,
        open: open.length,
        open_by_employee: [...byKey.entries()].map(([key, rows]) => ({
          key,
          count: rows.length,
          names: rows.map((row) => row.employee_name),
          ids: rows.map((row) => row.id)
        }))
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
