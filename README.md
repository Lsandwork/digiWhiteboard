# Fitdog Checking In / Checking Out Board

A standalone Next.js app for showing Fitdog dogs that are actively in transition in Gingr:

- Checking In
- Checking Out

This app only shows dogs staff currently need to act on. It does not show all checked-in dogs, checked-out dogs, full daycare counts, boarding dashboards, completed dogs, or historical checked-out lists.

## Routes

- `/` - live two-column board
- `/admin` - password-protected admin tools
- `POST /api/gingr/webhook` - Gingr webhook receiver
- `POST /api/gingr/sync` - backup sync and health check
- `GET /api/live-board` - public board data, filtered to active transitions only

## Install

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

GINGR_SUBDOMAIN=fitdog
GINGR_API_KEY=
GINGR_WEBHOOK_SIGNATURE_KEY=
GINGR_LOCATION_ID=1
GINGR_SYNC_SECRET=
ADMIN_PASSWORD=
```

`GINGR_API_KEY`, `GINGR_WEBHOOK_SIGNATURE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GINGR_SYNC_SECRET`, and `ADMIN_PASSWORD` must stay server-side only.

## Supabase Setup

1. Create a Supabase project.
2. Run `supabase/migrations/001_live_transition_board.sql` in the SQL editor or through the Supabase CLI.
3. Enable Realtime for `live_transition_dogs` in Database > Publications, or run `supabase/migrations/002_enable_realtime.sql` once.
4. Add your project URL, anon key, and service role key to `.env.local`.

The public RLS policy only allows reads where `hidden=false` and `display_status` is `checking_in` or `checking_out`. Writes happen through server-side API routes with the service role key.

## Run Locally

```bash
npm run dev
```

Open:

- Board: `http://localhost:3000`
- Admin: `http://localhost:3000/admin`

## Gingr Webhook Behavior

Displayed:

- `checking_in` adds or moves the dog to Checking In.
- `checking_out` adds or moves the dog to Checking Out.

Removed from the board:

- `check_in` hides the dog after check-in completes.
- `check_out` hides the dog after check-out completes.

Accepted for debugging, but not displayed:

- `animal_created`
- `animal_edited`
- `owner_created`
- `owner_edited`
- `incident_created`
- `incident_edited`

Webhook signatures use SHA256 HMAC with:

- Message: `webhook_type + entity_id + entity_type`
- Key: `GINGR_WEBHOOK_SIGNATURE_KEY`

Invalid signatures are stored with `verified=false` and return `403`.

## Connect Gingr

1. Open Gingr.
2. Go to Admin.
3. Go to Custom Configurations.
4. Paste this app's webhook URL into the Webhook URL field.
5. Set the Webhook Signature Key to the same value used in this app.
6. Save.
7. Test by moving a dog into Checking In or Checking Out in Gingr.
8. Confirm the dog appears on this board.
9. Confirm the dog disappears after check-in or check-out is completed.

Webhook URL format:

```text
https://YOUR-DOMAIN.com/api/gingr/webhook
```

## Admin

The `/admin` page requires `ADMIN_PASSWORD`. It can:

- View visible Checking In dogs
- View visible Checking Out dogs
- View the last 50 webhook events
- View failed webhook events
- Manually hide a dog
- Trigger manual Gingr sync
- Copy the webhook URL
- Show Gingr setup instructions
- Show whether environment variables are configured without revealing secret values

## Backup Sync

`POST /api/gingr/sync` requires the `x-sync-secret` header to match `GINGR_SYNC_SECRET`.

The sync is only a backup health check. It confirms whether dogs already shown as `checking_in` or `checking_out` should remain visible. It does not add all checked-in dogs and does not turn this into an attendance dashboard.

## Test Webhooks

Start the local server first:

```bash
npm run dev
```

Then run:

```bash
npm run test:webhook
npm run test:bad-signature
```

Use `TEST_BASE_URL` if your local server is not on port 3000:

```bash
TEST_BASE_URL=http://localhost:3001 npm run test:webhook
```

## Deploy to Vercel

1. Push this app to a Git repository.
2. Import it in Vercel.
3. Add all environment variables from `.env.example`.
4. Deploy.
5. Open `/admin`, copy the production webhook URL, and paste it into Gingr.

## TV, Tablet, and iPad Use

Open `/` on the device browser. The layout is PWA-ready and responsive for TV, desktop, tablet, iPad, and mobile. Use browser fullscreen or add it to the home screen for a kiosk-style display.
