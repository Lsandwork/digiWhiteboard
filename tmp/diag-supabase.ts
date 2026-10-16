import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, key, { auth: { persistSession: false } });

(async () => {
  for (const table of ["system_health_route_dog_traces", "system_health_route_audits", "route_plans"]) {
    const { data, error } = await supabase.from(table).select("*").order("created_at", { ascending: false }).limit(3);
    console.log(`\n== ${table}`, error?.message || "");
    for (const row of data || []) console.log(JSON.stringify(row).slice(0, 900));
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
