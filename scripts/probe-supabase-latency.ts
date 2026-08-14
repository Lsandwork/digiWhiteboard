import { loadEnvFiles } from "./load-env-local";

/**
 * Isolates where Supabase latency comes from: raw REST fetch vs supabase-js,
 * and cheap key lookups vs the shared admin_settings blob. Prints timings and
 * status codes only — never keys or row contents.
 */
async function probe(label: string, path: string, key: string, timeoutMs = 30_000) {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      headers: { apikey: key, authorization: `Bearer ${key}`, accept: "application/json" },
      signal: controller.signal
    });
    const text = await response.text();
    console.log(`${label}: http=${response.status} ${Date.now() - startedAt}ms bytes=${text.length}`);
    if (!response.ok) console.log(`  detail: ${text.slice(0, 200)}`);
  } catch (error) {
    console.log(`${label}: FAILED after ${Date.now() - startedAt}ms — ${error instanceof Error ? error.message : error}`);
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  loadEnvFiles();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!serviceKey) throw new Error("missing SUPABASE_SERVICE_ROLE_KEY");
  console.log(`service key length: ${serviceKey.length}, anon key present: ${Boolean(anonKey)}`);

  await probe("raw: admin_settings id only", "admin_settings?id=eq.default&select=id", serviceKey);
  await probe("raw: admin_users count", "admin_users?select=id&limit=1", serviceKey);
  await probe("raw: scoped staff_admin_ops", "admin_settings?id=eq.default&select=settings->staff_admin_ops", serviceKey);
  await probe("raw: full settings blob", "admin_settings?id=eq.default&select=settings", serviceKey, 60_000);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
