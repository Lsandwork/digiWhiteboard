import { loadEnvFiles } from "./load-env-local";
import { getServiceSupabase } from "../lib/supabase/server";

/**
 * Diagnostic: how big is the shared admin_settings.settings blob, and which
 * feature keys dominate it? Every page that reads admin_settings pays for the
 * whole row, so this is the first thing to check when a panel times out.
 */
async function timed<T>(label: string, work: () => PromiseLike<T>) {
  const startedAt = Date.now();
  try {
    const value = await work();
    console.log(`${label}: ${Date.now() - startedAt}ms`);
    return value;
  } catch (error) {
    console.log(`${label}: FAILED after ${Date.now() - startedAt}ms — ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

async function main() {
  loadEnvFiles();
  const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://unset.invalid").host;
  console.log(`project host: ${host}`);

  const supabase = getServiceSupabase({ timeoutMs: 45_000 });

  await timed("cheap probe (admin_settings id only)", () =>
    supabase.from("admin_settings").select("id").eq("id", "default").maybeSingle()
  );

  const scoped = await timed("scoped read (settings->staff_admin_ops)", () =>
    supabase.from("admin_settings").select("settings->staff_admin_ops").eq("id", "default").maybeSingle()
  );
  if (scoped && !scoped.error) {
    const value = (scoped.data as Record<string, unknown> | null)?.staff_admin_ops ?? null;
    console.log(`  scoped staff_admin_ops size: ${(Buffer.byteLength(JSON.stringify(value ?? null)) / 1024).toFixed(1)} KiB`);
  }

  const sizes = await timed("server-side size probe (pg_column_size / lengths)", () =>
    supabase.rpc("admin_settings_key_sizes")
  );
  if (sizes && !sizes.error) console.log(sizes.data);

  const full = await timed("full blob read (settings)", () =>
    supabase.from("admin_settings").select("settings").eq("id", "default").maybeSingle()
  );

  if (full && !full.error) {
    const settings = ((full.data as { settings?: unknown } | null)?.settings ?? {}) as Record<string, unknown>;
    const totalBytes = Buffer.byteLength(JSON.stringify(settings));
    const rows = Object.entries(settings)
      .map(([key, value]) => ({ key, bytes: Buffer.byteLength(JSON.stringify(value ?? null)) }))
      .sort((a, b) => b.bytes - a.bytes);
    console.log(`full blob: ${(totalBytes / 1024).toFixed(1)} KiB across ${rows.length} keys`);
    for (const row of rows.slice(0, 15)) {
      console.log(`  ${row.key}: ${(row.bytes / 1024).toFixed(1)} KiB`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
