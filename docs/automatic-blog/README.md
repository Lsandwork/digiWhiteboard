# Automatic Blog

Fitdog’s editorial publishing system inside RuffOps. It helps staff plan topics, draft articles with AI assistance, run independent quality checks, approve content, and publish to the native blog (and optional WordPress or webhook destinations).

This is **not** a “set and forget” content spammer. Defaults favor human review, real media, and honest writing.

## Where it lives

| Surface | URL |
|---------|-----|
| Staff admin | `https://staff.ruffops.com/admin/automatic-blog` (also reachable via `ruffops.com` staff routing) |
| Public blog | `/blog` (native adapter) |
| Public article | `/blog/{slug}` |

Code and data:

- App path constant: `BLOG_APP_PATH` → `/admin/automatic-blog`
- Domain logic: `lib/blog/*`
- Schema: `supabase/migrations/054_automatic_blog.sql`
- Permissions: `blog.*` (see [SETUP.md](./SETUP.md))

## Defaults that matter

| Setting | Default | Why |
|---------|---------|-----|
| Auto-publish | **OFF** | Nothing goes live without an intentional publish path |
| AI-generated images | **OFF** | Prefer real Fitdog / consented photos |
| Human Editorial Score threshold | **90** | Drafts below this go to `NEEDS_CHANGES` |
| Topic Quality Score threshold | **85** | Weak topics cannot enter generation |
| First N articles | **25** require manual **APPROVED** status | Warm-up period before any looser automation |
| Module enabled flag | `BLOG_ENABLED` | Staff access; Super Admin can still inspect when needed |
| Emergency stop | `blog_settings.emergency_off` | Halts generation and publishing immediately |

## How content flows (short version)

1. **Topic** scored (Topic Quality Score ≥ 85).
2. **Brief** created from topic fields.
3. **Human-First Writer** drafts (Gemini primary; deterministic fallback if AI is down).
4. **Independent evaluators** score voice, empathy, practicality, facts, brand, SEO.
5. Final **Human Editorial Score** must meet threshold (default 90).
6. Staff **review / approve** (required for first 25 publishes).
7. **Publish** via native `/blog`, WordPress REST, or protected webhook.
8. Cron `/api/cron/blog-jobs` (auth: `CRON_SECRET`) processes queued jobs.

## Documentation index

| Doc | What it’s for |
|-----|----------------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Tables, statuses, agents, layers |
| [SETUP.md](./SETUP.md) | Migration, env vars, permissions, first login |
| [EDITORIAL-STANDARDS.md](./EDITORIAL-STANDARDS.md) | What “good” means for Fitdog posts |
| [HUMAN-VOICE.md](./HUMAN-VOICE.md) | Natural voice rules and scoring |
| [TOPIC-QUALITY.md](./TOPIC-QUALITY.md) | Topic Quality Score and weak-topic rejection |
| [PROVIDERS.md](./PROVIDERS.md) | Gemini / OpenAI / Anthropic / Perplexity / Cursor |
| [PUBLISHING.md](./PUBLISHING.md) | Native, WordPress, webhook |
| [AUTOMATION.md](./AUTOMATION.md) | Jobs, cron, auto-publish gates |
| [MEDIA-LIBRARY.md](./MEDIA-LIBRARY.md) | Assets, source classes, approvals |
| [IMAGE-POLICY.md](./IMAGE-POLICY.md) | Why AI images are off; approval rules |
| [CONSENT.md](./CONSENT.md) | Photo / subject consent for public use |
| [SECURITY.md](./SECURITY.md) | Secrets, RBAC, SSRF guards |
| [OPERATIONS.md](./OPERATIONS.md) | Emergency off, cost limits, day-to-day ops |
| [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Failed jobs, score failures, publish errors |

## Hard rules (non-negotiable)

- Do **not** invent stories, quotes, client names, staff opinions, statistics, or studies.
- Do **not** invent or scrape API keys. Super Admin enters keys as environment variables (including `CURSOR_API_KEY` if used).
- Cursor is for **maintenance / development**, not the sole article writer.
- Prefer real photography with consent over AI imagery.
- Keep Fitdog promotion light and optional — helpful first, sales second.

## Quick emergency off

1. Set `blog_settings.emergency_off = true` (Settings in admin, or DB update on `id = 'default'`).
2. Optionally set `BLOG_ENABLED=false` so non–Super Admin staff lose API access.
3. Confirm no publish attempts continue; see [OPERATIONS.md](./OPERATIONS.md).

## Public Fitdog Blog

- Homepage `/blog`, articles `/blog/articles`, categories `/blog/category/[slug]`, article pages `/blog/[slug]`
- Brand orange `#ff6f26`; logo `/assets/lobby-whiteboard/light-v2/branding/fitdog-dog-logo-exact.png`
- Five launch articles in `lib/blog/content/initial-articles.ts`
- Migrations: `054_automatic_blog.sql`, `055_automatic_blog_public.sql`
