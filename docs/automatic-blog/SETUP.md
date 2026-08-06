# Setup

Practical steps to turn on Automatic Blog in RuffOps.

## Prerequisites

- Supabase project with service role available to the app (`SUPABASE_SERVICE_ROLE_KEY`)
- Staff admin auth working on `staff.ruffops.com`
- Super Admin (owner) access to set env vars and permissions
- Optional: Gemini API key for AI drafting (recommended)

## 1. Run the migration

Apply:

```text
supabase/migrations/054_automatic_blog.sql
```

This creates all `blog_*` tables, seeds content pillars, a default voice profile, default settings (`id = 'default'`), and publish destination stubs (native active; WordPress/webhook inactive).

Confirm:

```sql
select id, enabled, auto_publish_enabled, ai_images_enabled,
       human_score_threshold, topic_score_threshold,
       manual_approval_first_n, emergency_off
from blog_settings
where id = 'default';
```

Expect thresholds 90 / 85, auto-publish false, AI images false, first N = 25.

## 2. Environment variables

Set these in Vercel (or local `.env`). **Do not invent or scrape keys.** Super Admin pastes real values from the provider consoles.

### Feature flags

| Variable | Purpose |
|----------|---------|
| `BLOG_ENABLED` | Staff module access. Set `false` / `0` / `off` to disable for non–Super Admin. |
| `BLOG_PUBLIC_ENABLED` | Public `/blog` surface. Same false values disable. |
| `NEXT_PUBLIC_SITE_URL` | Used for native publish URLs (e.g. `https://staff.ruffops.com` or public site base). |
| `CRON_SECRET` | Bearer token for `/api/cron/blog-jobs` (and other RuffOps crons). |

### AI providers

| Variable | Role |
|----------|------|
| `GEMINI_API_KEY` | **Primary** writer gateway (preferred) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Alternate Gemini key; used if `GEMINI_API_KEY` is empty |
| `GEMINI_MODEL` | Optional model override (shared Fitdog Gemini client) |
| `OPENAI_API_KEY` | Optional secondary provider |
| `ANTHROPIC_API_KEY` | Optional secondary provider |
| `PERPLEXITY_API_KEY` | Optional research-oriented provider |
| `CURSOR_API_KEY` | **Maintenance/dev only** — Super Admin enters manually; never sole writer |

See [PROVIDERS.md](./PROVIDERS.md).

### Publishing

| Variable | Role |
|----------|------|
| `WORDPRESS_URL` | WordPress site base (no trailing slash required) |
| `WORDPRESS_USERNAME` | WP user for REST |
| `WORDPRESS_APPLICATION_PASSWORD` | WP application password (not the login password) |
| `BLOG_PUBLISH_WEBHOOK_URL` | HTTPS webhook endpoint |
| `BLOG_PUBLISH_WEBHOOK_SECRET` | Optional shared secret header |

### Fitdog blog-related (optional)

Use `FITDOG_BLOG_*` env vars when wiring Fitdog-specific blog integrations (base URL, site key, sync toggles, etc.). Only set values you actually have from Fitdog / hosting — leave blank until needed. Do not invent placeholders that look like live secrets.

Examples of the **pattern** (names depend on the integration you enable):

```text
FITDOG_BLOG_BASE_URL=
FITDOG_BLOG_PUBLIC_ORIGIN=
FITDOG_BLOG_SYNC_ENABLED=false
```

## 3. Cron

Register (or confirm) Vercel cron for:

```text
GET|POST /api/cron/blog-jobs
Authorization: Bearer <CRON_SECRET>
```

Same auth pattern as other RuffOps crons: Bearer `CRON_SECRET`, or Vercel’s `x-vercel-cron: 1` header.

Jobs are stored in `blog_generation_jobs` with retries (`max_attempts` default 3).

## 4. Permissions

Permission group: `automatic_blog` in `lib/admin/permission-catalog.ts`.

| Key | Use |
|-----|-----|
| `blog.view` | Open the workspace (required baseline) |
| `blog.submit_idea` | Submit topic ideas |
| `blog.create` | Create topics / briefs / drafts |
| `blog.edit` | Edit drafts and metadata |
| `blog.review` | Run / review editorial checks |
| `blog.approve` | Approve for scheduling |
| `blog.schedule` | Schedule approved articles |
| `blog.publish` | Publish |
| `blog.archive` | Archive |
| `blog.delete` | Delete (protected) |
| `blog.manage_sources` | Research sources |
| `blog.manage_knowledge` | Fitdog knowledge base |
| `blog.manage_media` | Media library |
| `blog.approve_images` | Image approvals |
| `blog.manage_brand` | Brand voice |
| `blog.manage_providers` | AI providers (Super Admin) |
| `blog.manage_publishing` | Destinations |
| `blog.manage_automation` | Automation rules |
| `blog.view_costs` | Cost / usage |
| `blog.view_analytics` | Analytics |
| `blog.view_audit_log` | Audit log |

Role presets in `lib/blog/permissions.ts`:

- **Marketing** — day-to-day create/review/publish/media (no provider/automation/delete)
- **Management** — marketing + knowledge, costs, audit
- **Trainer / Groomer** — view, submit idea, review, knowledge

Assign via the existing staff permission UI. Super Admin (`owner_admin`) bypasses permission checks but still respects emergency stop for generation/publish.

## 5. First admin visit

1. Open `https://staff.ruffops.com/admin/automatic-blog`.
2. Complete the Setup Wizard (nav: Setup).
3. Confirm settings: auto-publish off, AI images off, thresholds 90 / 85.
4. Seed topics if empty (service: `seedBlogTopics`) — uses scored seed list in `lib/blog/topics/seed-topics.ts`.
5. Configure Gemini (or confirm key present) under AI Providers.
6. Leave WordPress / webhook off until credentials are real and tested.
7. Publish destination default: **native**.

## 6. Smoke checklist

- [ ] Migration applied; `blog_settings` row exists
- [ ] `blog.view` granted to a test marketing user
- [ ] Gemini connection test succeeds (or deterministic draft fallback works)
- [ ] Create a topic scoring ≥ 85
- [ ] Generate draft → lands in `HUMAN_REVIEW` or `NEEDS_CHANGES`
- [ ] Approve → publish to native `/blog/{slug}`
- [ ] Cron auth rejects requests without `CRON_SECRET`
- [ ] Emergency off blocks generate/publish

## 7. Keep off until ready

Safe initial state:

```text
BLOG_ENABLED=true          # or false until staff are trained
BLOG_PUBLIC_ENABLED=false  # until first real articles exist
auto_publish_enabled=false
ai_images_enabled=false
emergency_off=false
```

Do not enable auto-publish before the first 25 manually approved articles have shipped cleanly.
