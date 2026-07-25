import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { runSystemHealthAudit } from "../lib/admin/system-health-audit";

loadEnvConfig(process.cwd());

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase credentials.");

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const state = await runSystemHealthAudit(supabase as never, { trigger: "manual", autoFix: true });
  const latest = state.runs[0];
  console.log(
    JSON.stringify(
      {
        overall_status: state.overall_status,
        summary: latest?.summary ?? null,
        rows: (latest?.issues ?? []).map((issue) => ({
          status: issue.status,
          severity: issue.severity,
          title: issue.title,
          auto_fix: issue.auto_fix
        }))
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
