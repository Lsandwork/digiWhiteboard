/**
 * Applies 098–100 and their rollbacks against a DISPOSABLE local Supabase Postgres
 * (public.ecr.aws/supabase/postgres) and asserts the resulting grants/RLS/policies.
 *
 *   docker run -d --rm --name ruffops-sec-test -e POSTGRES_PASSWORD=localtestonly \
 *     -p 127.0.0.1:55432:5432 public.ecr.aws/supabase/postgres:17.6.1.127
 *   SECURITY_MIGRATION_TEST_URL=postgres://postgres:localtestonly@127.0.0.1:55432/postgres \
 *     npm run test:security-migrations
 *
 * Refuses to run against anything but localhost.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";

const url = process.env.SECURITY_MIGRATION_TEST_URL;
if (!url) {
  console.log("SECURITY_MIGRATION_TEST_URL not set; skipping (needs a disposable local Postgres).");
  process.exit(0);
}
const host = new URL(url).hostname;
if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
  console.error(`Refusing to run migration tests against non-local host: ${host}`);
  process.exit(1);
}

const root = process.cwd();
const sql = (path: string) => readFileSync(resolve(root, path), "utf8");
const MIGRATIONS = [
  "supabase/migrations/098_security_lockdown_open_tables.sql",
  "supabase/migrations/099_security_cast_tv_media_storage_writes.sql",
  "supabase/migrations/100_security_default_privileges.sql"
];
const ROLLBACKS = [
  "supabase/rollbacks/100_security_default_privileges.down.sql",
  "supabase/rollbacks/099_security_cast_tv_media_storage_writes.down.sql",
  "supabase/rollbacks/098_security_lockdown_open_tables.down.sql"
];

function lockdownTables() {
  const body = sql(MIGRATIONS[0]);
  const list = body.slice(body.indexOf("targets text[] := array["), body.indexOf("];"));
  return [...list.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
}

async function expectDenied(client: Client, role: string, statement: string, label: string) {
  await client.query("begin");
  try {
    await client.query(`set local role ${role}`);
    await client.query(statement);
    assert.fail(`${label}: expected permission/RLS denial for ${role}`);
  } catch (error) {
    const code = (error as { code?: string }).code;
    assert.ok(code === "42501", `${label}: expected 42501, got ${code} ${(error as Error).message}`);
  } finally {
    await client.query("rollback");
  }
}

async function expectAllowed(client: Client, role: string, statement: string, label: string) {
  await client.query("begin");
  try {
    await client.query(`set local role ${role}`);
    await client.query(statement);
  } finally {
    await client.query("rollback");
  }
  void label;
}

async function scalar<T>(client: Client, query: string, params: unknown[] = []): Promise<T> {
  const { rows } = await client.query(query, params);
  return Object.values(rows[0])[0] as T;
}

async function setup(client: Client, tables: string[]) {
  // Restore production's pre-migration default privileges so reruns start from the same state.
  await client.query(sql("supabase/rollbacks/100_security_default_privileges.down.sql"));
  await client.query(`drop function if exists public.patch_admin_settings_json(text, jsonb)`);
  await client.query(`drop function if exists public.patch_admin_settings_json_if_revision(text, bigint, jsonb)`);
  for (const table of tables) {
    await client.query(`drop table if exists public.${table} cascade`);
    await client.query(`create table public.${table} (id bigserial primary key, note text)`);
  }
  await client.query(`drop table if exists public.live_transition_dogs cascade`);
  await client.query(`create table public.live_transition_dogs (id bigserial primary key, hidden boolean default false, display_status text, raw_payload jsonb)`);
  await client.query(`alter table public.live_transition_dogs enable row level security`);
  await client.query(`create policy "Public can read active transition dogs" on public.live_transition_dogs for select to anon, authenticated using (hidden = false and display_status in ('checking_in','checking_out'))`);
  await client.query(`create or replace function public.patch_admin_settings_json(p_key text, p_value jsonb) returns void language plpgsql security definer set search_path = public as $$ begin end $$`);
  await client.query(`create or replace function public.patch_admin_settings_json_if_revision(p_key text, p_expected_revision bigint, p_value jsonb) returns boolean language plpgsql security definer set search_path = public as $$ begin return true; end $$`);
  await client.query(`revoke execute on function public.patch_admin_settings_json(text, jsonb) from public`);
  await client.query(`revoke execute on function public.patch_admin_settings_json_if_revision(text, bigint, jsonb) from public`);

  const hasObjects = await scalar<boolean>(client, `select to_regclass('storage.objects') is not null`);
  if (!hasObjects) {
    // The bare postgres image has no storage-api; mirror its table, RLS and grants
    // (needs the local superuser — postgres cannot create in schema storage).
    const adminUrl = new URL(url!);
    adminUrl.username = "supabase_admin";
    const admin = new Client({ connectionString: adminUrl.toString() });
    await admin.connect();
    try {
      await admin.query(`create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid)`);
      await admin.query(`alter table storage.objects enable row level security`);
      await admin.query(`grant usage on schema storage to anon, authenticated, service_role`);
      await admin.query(`grant all on storage.objects to anon, authenticated, service_role`);
      await admin.query(`alter table storage.objects owner to postgres`);
    } finally {
      await admin.end();
    }
  }
  for (const name of ["cast_tv_media_public_read", "cast_tv_media_signed_insert", "cast_tv_media_signed_update", "cast_tv_media_signed_delete"]) {
    await client.query(`drop policy if exists "${name}" on storage.objects`);
  }
  await client.query(`create policy "cast_tv_media_public_read" on storage.objects for select to public using (bucket_id = 'cast-tv-media')`);
  await client.query(sql("supabase/rollbacks/099_security_cast_tv_media_storage_writes.down.sql"));
}

async function assertPreState(client: Client, tables: string[]) {
  for (const table of tables) {
    assert.equal(await scalar(client, `select relrowsecurity from pg_class where oid = $1::regclass`, [`public.${table}`]), false);
    assert.equal(await scalar(client, `select has_table_privilege('anon', $1, 'SELECT')`, [`public.${table}`]), true);
  }
  await expectAllowed(client, "anon", `select * from public.ruffly_contact_identities`, "pre: anon read open");
  await expectAllowed(client, "anon", `insert into storage.objects (bucket_id, name) values ('cast-tv-media', 'pre.jpg')`, "pre: anon storage write open");
  assert.equal(await scalar(client, `select has_function_privilege('anon', 'public.patch_admin_settings_json(text, jsonb)', 'EXECUTE')`), true);
}

async function assertLockedDown(client: Client, tables: string[]) {
  for (const table of tables) {
    const reg = `public.${table}`;
    assert.equal(await scalar(client, `select relrowsecurity from pg_class where oid = $1::regclass`, [reg]), true, `${table} rls`);
    for (const role of ["anon", "authenticated"]) {
      for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"]) {
        assert.equal(await scalar(client, `select has_table_privilege($1, $2, $3)`, [role, reg, privilege]), false, `${role} ${privilege} ${table}`);
      }
    }
    for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      assert.equal(await scalar(client, `select has_table_privilege('service_role', $1, $2)`, [reg, privilege]), true, `service_role ${privilege} ${table}`);
    }
  }

  await expectDenied(client, "anon", `select * from public.ruffly_contact_identities`, "anon read");
  await expectDenied(client, "anon", `insert into public.blog_subscribers (note) values ('x')`, "anon insert");
  await expectDenied(client, "authenticated", `delete from public.route_owner_tracking`, "authenticated delete");
  await expectAllowed(client, "service_role", `insert into public.ruffly_internal_notes (note) values ('ok'); select * from public.ruffly_internal_notes`, "service_role rw");

  for (const fn of ["public.patch_admin_settings_json(text, jsonb)", "public.patch_admin_settings_json_if_revision(text, bigint, jsonb)"]) {
    assert.equal(await scalar(client, `select has_function_privilege('anon', $1, 'EXECUTE')`, [fn]), false, `anon exec ${fn}`);
    assert.equal(await scalar(client, `select has_function_privilege('authenticated', $1, 'EXECUTE')`, [fn]), false, `auth exec ${fn}`);
    assert.equal(await scalar(client, `select has_function_privilege('service_role', $1, 'EXECUTE')`, [fn]), true, `service exec ${fn}`);
  }
  await expectDenied(client, "anon", `select public.patch_admin_settings_json('k', '{}'::jsonb)`, "anon rpc");
  await expectAllowed(client, "service_role", `select public.patch_admin_settings_json('k', '{}'::jsonb)`, "service rpc");

  // Untouched: realtime display table keeps its anon read policy.
  assert.equal(await scalar(client, `select has_table_privilege('anon', 'public.live_transition_dogs', 'SELECT')`), true);
  await expectAllowed(client, "anon", `select id from public.live_transition_dogs`, "live_transition_dogs anon read");

  const storagePolicies = await client.query(
    `select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'cast_tv_media%' order by 1`
  );
  assert.deepEqual(storagePolicies.rows.map((row) => row.policyname), ["cast_tv_media_public_read"]);
  await expectDenied(client, "anon", `insert into storage.objects (bucket_id, name) values ('cast-tv-media', 'x.jpg')`, "anon storage insert");
  await expectAllowed(client, "anon", `select name from storage.objects where bucket_id = 'cast-tv-media'`, "anon storage read");
  await expectAllowed(client, "service_role", `insert into storage.objects (bucket_id, name) values ('cast-tv-media', 'ok.jpg')`, "service storage insert");

  await client.query(`drop table if exists public.zz_future_table`);
  await client.query(`create table public.zz_future_table (id int)`);
  assert.equal(await scalar(client, `select has_table_privilege('anon', 'public.zz_future_table', 'SELECT')`), false, "future table closed to anon");
  assert.equal(await scalar(client, `select has_table_privilege('service_role', 'public.zz_future_table', 'SELECT')`), true, "future table open to service_role");
  await client.query(`create or replace function public.zz_future_fn() returns int language sql as $$ select 1 $$`);
  assert.equal(await scalar(client, `select has_function_privilege('anon', 'public.zz_future_fn()', 'EXECUTE')`), false, "future fn closed to anon");
  assert.equal(await scalar(client, `select has_function_privilege('service_role', 'public.zz_future_fn()', 'EXECUTE')`), true, "future fn open to service_role");
  await client.query(`drop table public.zz_future_table`);
  await client.query(`drop function public.zz_future_fn()`);
}

async function testLoginThrottleMigration(client: Client) {
  const up = sql("supabase/migrations/101_admin_login_throttle.sql");
  const down = sql("supabase/rollbacks/101_admin_login_throttle.down.sql");
  await client.query(down);
  await client.query(up);
  await client.query(up);

  assert.equal(await scalar(client, `select has_table_privilege('anon', 'public.admin_login_throttle', 'SELECT')`), false);
  assert.equal(await scalar(client, `select has_table_privilege('authenticated', 'public.admin_login_throttle', 'SELECT')`), false);
  assert.equal(
    await scalar(client, `select has_function_privilege('anon', 'public.admin_login_throttle_fail(text, integer, integer, integer)', 'EXECUTE')`),
    false
  );
  await expectDenied(client, "anon", `select public.admin_login_throttle_fail('k', 5, 900, 900)`, "anon throttle rpc");

  // 20 concurrent failures on one key from separate connections: no lost updates.
  const workers = await Promise.all(
    Array.from({ length: 10 }, async () => {
      const worker = new Client({ connectionString: url });
      await worker.connect();
      await worker.query("set role service_role");
      return worker;
    })
  );
  try {
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        workers[i % workers.length].query(`select public.admin_login_throttle_fail('ip_user:race', 5, 900, 900) as locked`)
      )
    );
    const lockedCount = results.filter((result) => result.rows[0].locked !== null).length;
    assert.ok(lockedCount >= 16, `locks once the 5th failure lands (got ${lockedCount} locked responses)`);
    const row = await client.query(`select failures, locked_until > now() as locked from public.admin_login_throttle where key = 'ip_user:race'`);
    assert.equal(row.rows[0].locked, true);
    assert.equal(row.rows[0].failures, 0, "20 failures with max 5 = 4 locks, counter reset exactly (no lost updates)");

    const first = await workers[0].query(`select public.admin_login_throttle_fail('user:fresh', 100, 3600, 300) as locked`);
    assert.equal(first.rows[0].locked, null, "single failure does not lock");
    await client.query(`update public.admin_login_throttle set window_started_at = now() - interval '2 hours' where key = 'user:fresh'`);
    await workers[0].query(`select public.admin_login_throttle_fail('user:fresh', 100, 3600, 300)`);
    assert.equal(await scalar(client, `select failures from public.admin_login_throttle where key = 'user:fresh'`), 1, "expired window restarts the count");

    await client.query(`insert into public.admin_login_throttle (key, updated_at) values ('stale', now() - interval '3 days')`);
    await workers[0].query(`select public.admin_login_throttle_fail('any', 5, 900, 900)`);
    assert.equal(await scalar(client, `select count(*)::int from public.admin_login_throttle where key = 'stale'`), 0, "stale rows pruned");
  } finally {
    await Promise.all(workers.map((worker) => worker.end()));
  }

  await client.query(down);
  assert.equal(await scalar(client, `select to_regclass('public.admin_login_throttle') is null`), true, "rollback removes table");
  await client.query(up);
}

async function main() {
  const client = new Client({ connectionString: url });
  await client.connect();
  const tables = lockdownTables();
  assert.equal(tables.length, 66, "098 lists the 66 tables found without RLS in production");
  try {
    await setup(client, tables);
    await assertPreState(client, tables);

    for (const file of MIGRATIONS) await client.query(sql(file));
    await assertLockedDown(client, tables);

    for (const file of ROLLBACKS) await client.query(sql(file));
    await assertPreState(client, tables);
    const restored = await client.query(
      `select count(*)::int as n from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'cast_tv_media_signed_%'`
    );
    assert.equal(restored.rows[0].n, 3, "rollback restores 087 storage policies");

    for (const file of MIGRATIONS) await client.query(sql(file));
    for (const file of MIGRATIONS) await client.query(sql(file));
    await assertLockedDown(client, tables);

    await testLoginThrottleMigration(client);

    console.log("security migration tests passed (apply, rollback, re-apply, idempotent, throttle atomicity)");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
