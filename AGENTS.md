# AGENTS.md

## Cursor Cloud specific instructions

RuffOps is a single **Next.js 16 (App Router) + TypeScript** app backed by **Supabase**
(Postgres + Realtime + Storage). The many product modules (live transition board,
lobby/CAST-TV signage, admin/RBAC, Ruffly CRM, route generator, automatic blog, etc.)
all run inside this one app; different surfaces are selected by host in `middleware.ts`.
There is also a separate optional Python microservice in `services/route-worker` (only
needed for the Route Generator; not required to run or test the main app). Nearly every
non-core integration (Gingr live API, Twilio, Resend, Samsara, LLMs, Route Generator,
Ruffly sending) is feature-flagged **off** by default, so the app runs end-to-end with
only local Supabase + a `.env.local`.

Standard commands live in `package.json` (`dev`, `build`, `lint`, `typecheck`, `test:*`)
and setup is documented in `README.md`. Notes below are only the non-obvious caveats.

### Runtime / services
- `npm install` installs Node deps (already handled by the startup update script).
- The app needs **local Supabase**, which requires **Docker**. Docker is not part of the
  Node update script; ensure the daemon is running before starting Supabase. If Docker
  is not installed on a fresh VM, install Docker CE, then start it and make the socket
  usable by the `ubuntu` user:
  ```bash
  sudo dockerd > /tmp/dockerd.log 2>&1 &   # if not already running
  sudo chmod 666 /var/run/docker.sock
  ```
  (Docker 29 works with the `fuse-overlayfs` storage driver via `/etc/docker/daemon.json`.)

### Starting local Supabase — IMPORTANT non-obvious gotcha
`npx supabase start` (and `supabase db reset`) **fails** on this repo. The
`supabase/migrations` folder has **duplicate numeric prefixes** (`023_*` and `025_*`),
and the CLI migration tracker uses that prefix as a primary key, so it dies with
`duplicate key value violates unique constraint "schema_migrations_pkey"`. Do **not**
edit/rename the committed migrations. Instead bring services up with migrations moved
aside, then apply the SQL directly with `psql` (sorted by filename, which does not
collide), grant the Data API roles, and reload PostgREST:

```bash
cd /workspace
# 1. Start services WITHOUT auto-applying migrations
mv supabase/migrations /tmp/ruffops-migrations && npx supabase start; mv /tmp/ruffops-migrations supabase/migrations

# 2. Apply all migrations directly (filename order, no prefix collision)
DB=$(docker ps --format '{{.Names}}' | grep -m1 supabase_db)
for f in $(ls supabase/migrations/*.sql | sort); do
  docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$f" || { echo "FAILED: $f"; break; }
done

# 3. Grant API roles + reload PostgREST schema cache.
#    Newer Supabase CLI does NOT auto-expose tables created outside its own migration
#    runner, so anon/authenticated/service_role get "permission denied" until granted.
#    RLS policies from the migrations still gate anon access after these grants.
docker exec -i "$DB" psql -U postgres -d postgres <<'SQL'
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
SQL
```

`npx supabase start` prints the local `API_URL`, `ANON_KEY`, and `SERVICE_ROLE_KEY` — put
those in `.env.local`. `live_transition_dogs` is already in the `supabase_realtime`
publication (migration `002`), so the board's live updates work out of the box.

### .env.local (not committed; `.env*` is gitignored)
Minimum vars to boot the app and exercise the core board flow:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
  (from `npx supabase start`)
- `GINGR_WEBHOOK_SIGNATURE_KEY` and `GINGR_SYNC_SECRET` (any dev value; the webhook test
  signs with `GINGR_WEBHOOK_SIGNATURE_KEY`)
- `ADMIN_USERNAME=lonnie@fitdog.com`, `ADMIN_PASSWORD=...`, `ADMIN_SESSION_SECRET=...`
  (env login for `/admin`; username `admin` also aliases to the Super Admin)
- `NEXT_PUBLIC_SITE_URL=http://localhost:3000`

With `GINGR_API_KEY` set to a dummy value, the live board's outbound Gingr fetch just
fails gracefully and the board is driven by Supabase rows (webhooks) — which is the
correct local behavior.

### Run / verify
- Dev server: `npm run dev` (serves on `http://localhost:3000`; board `/`, admin `/admin`).
  `npm run dev` plays an ASCII boot animation first — it auto-skips on non-TTY, or force
  skip with `RUFFOPS_BOOT=0 npm run dev`.
- Lint: `npm run lint` (note: the repo currently has pre-existing lint errors, mostly
  `react-hooks/preserve-manual-memoization`; the command itself runs fine).
- Types: `npm run typecheck` (clean).
- Tests: `tsx`-based scripts under `scripts/` via `npm run test:*`. Server-hitting tests
  (e.g. `npm run test:webhook`) need the dev server running; set `TEST_BASE_URL` if not on
  port 3000. Core smoke = `npm run test:webhook` (simulates a signed Gingr check-in/out and
  asserts the `/api/live-board` counts).
