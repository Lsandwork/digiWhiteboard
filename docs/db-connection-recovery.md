# Recovering RuffOps when Supabase stops answering

## The symptom

Pages load, but every panel that needs live data is empty or shows a delayed /
retry state. Commissions shows no rows. My Shift and the boards fall back to
last-good or empty. Nothing in the app is broken in isolation — every database
read is failing at once.

## Confirming it

Open, as Super Admin:

```
https://fitdog.ruffops.com/api/admin/package-commissions?view=diagnostics
```

Connection exhaustion looks like this — HTTP is instant, queries never return:

```json
{
  "summary": "Supabase REST did not respond to any probe.",
  "probes": [
    { "name": "rest_head_only",   "ok": false, "detail": "This operation was aborted" },
    { "name": "rest_exact_count", "ok": false, "detail": "no response within 4000ms" }
  ]
}
```

Two details identify this failure specifically:

- `https://<ref>.supabase.co/rest/v1/` returns **401 in well under a second**, so
  PostgREST and the project itself are up.
- Every query made with a real key **hangs** instead of erroring. PostgREST is
  accepting requests and then waiting forever for a free Postgres connection.

If REST instead returns Cloudflare HTML or a 522, that is a different problem —
the origin is down rather than starved.

## Why it happens

`service_role` ships with **no `statement_timeout`**, and that is the role the
app's service key runs as. A slow query holds its Postgres backend until it
finishes, even after the caller has aborted and moved on. Crons that run every
minute then stack more backends on top. Once the connections are gone, PostgREST
cannot even rebuild its schema cache (`PGRST002`) and everything queues.

## Fixing it now

Run this in the **Supabase Dashboard → SQL Editor**. It needs no local
credentials and takes about a minute.

```sql
-- 1. See what is holding connections.
select usename, state, count(*) as connections,
       max(now() - coalesce(query_start, xact_start)) as longest
from pg_stat_activity
group by usename, state
order by connections desc;

-- 2. Stop abandoned work from holding a connection forever.
alter role service_role set statement_timeout = '30s';
alter role service_role set idle_in_transaction_session_timeout = '30s';

-- 3. Clear backends that are already stuck.
select pg_terminate_backend(pid)
from pg_stat_activity
where usename = 'authenticator'
  and pid <> pg_backend_pid()
  and (
        state like 'idle in transaction%'
     or (state = 'active' and now() - query_start > interval '10 seconds')
      );

-- 4. Tell PostgREST to rebuild its schema cache.
select pg_notify('pgrst', 'reload schema');
```

Step 2 is the durable part: it bounds the damage next time. Steps 3 and 4 clear
the current pile-up.

The same steps are scripted, if you have `SUPABASE_DB_PASSWORD` in `.env.local`:

```bash
npx tsx scripts/recover-db-connections.ts          # dry run — reports only
npx tsx scripts/recover-db-connections.ts --apply  # applies steps 2–4
```

The script tries the direct host first and falls back to the Supavisor session
pooler, because `db.<ref>.supabase.co` is IPv6-only and unreachable from most
IPv4 networks.

## Reducing the next outage

Add **`SUPABASE_DB_PASSWORD`** (Supabase → Settings → Database → password) to
Vercel → Project → Settings → Environment Variables, for Production.

The commission ledger already has a direct-Postgres fallback that runs through
the Supavisor pooler when PostgREST is starved. The diagnostics output shows
whether it is available:

```json
"configured": { "dbPassword": false, "directPostgresUsable": false }
```

While that reads `false`, the fallback cannot run and a starved PostgREST means
an empty ledger.

Related tooling: `scripts/diagnose-db-saturation.ts` (what is consuming
connections), `scripts/measure-admin-settings-blob.ts` and
`scripts/prune-admin-settings-blob.ts` (the oversized `admin_settings` blob that
produced the original long-running reads).
