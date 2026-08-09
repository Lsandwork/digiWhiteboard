# Automation

Full-auto SEO posting (**mode C**) is supported: generate → score gates → human-like schedule → publish. Kill switch and score gates always apply.

## Settings (blog_settings)

| Flag | Role |
|------|------|
| `full_auto_enabled` | Cron picks highest SEO topic, generates, schedules jittered LA slots |
| `auto_publish_enabled` | Cron publishes due `SCHEDULED` articles |
| `wordpress_mirror_enabled` | After native publish, mirror to WordPress REST |
| `posts_per_week` | Human-like weekly cadence (default 3) |
| `min_hours_between_posts` | Spacing between posts (default 20h) |
| `schedule_jitter_*` | ± minutes so slots are not robotic |
| `quiet_hours_*` | Avoid late-night PT publishes |
| `emergency_off` | Blocks generate + publish immediately |

Migration `061_blog_posting_social.sql` enables `full_auto_enabled` + `auto_publish_enabled` for the default row. Super Admin can turn them off anytime.

## Human-like SEO scheduler

Module: `lib/blog/scheduler/human-like-seo.ts` + `lib/blog/scheduler/auto-run.ts`

- Prefers Tue–Thu LA morning/afternoon windows
- Jittered minutes; refuses same-hour dumps
- Skips recently used primary keywords
- Holds articles below human editorial threshold (default ≥ 90)

## Job queue

Table: `blog_generation_jobs`

| Column | Notes |
|--------|-------|
| `job_type` | `seed_topics`, `auto_generate_and_schedule`, … |
| `payload` | JSON input |
| `status` | `queued` → `running` → `succeeded` / `failed` / `cancelled` |
| `attempts` / `max_attempts` | Default max 3 |
| `run_after` | Delay / schedule |

## Cron endpoint

```text
/api/cron/blog-jobs
```

Every ~15 minutes (`vercel.json`). Flow:

1. Seed topics (idempotent)
2. Full-auto SEO cycle (if enabled)
3. Publish due `SCHEDULED` articles
4. Retry failed WordPress mirrors
5. Process social post queue
6. Drain lightweight generation jobs

Auth: `Authorization: Bearer ${CRON_SECRET}` or `x-vercel-cron: 1`.

## Score gates (never bypassed)

| Guard | Default |
|-------|---------|
| Topic score | ≥ 85 to generate |
| Human editorial score | ≥ 90 to schedule/publish |
| Fact-check medical/legal | May hold in `FACT_CHECK` |
| Emergency off | Blocks generate + publish |
| AI images | OFF unless explicitly enabled |

## WordPress mirror

- Native Fitdog `/blog` always publishes first
- Mirror via `lib/blog/publishing/wordpress-mirror.ts` when enabled
- SEO meta (Yoast / Rank Math keys) + canonical back to Fitdog
- Failures logged in `blog_publish_attempts` without failing native
- Test: Publishing Connections → **Test WordPress connection**

Env: `WORDPRESS_URL`, `WORDPRESS_USERNAME`, `WORDPRESS_APPLICATION_PASSWORD`

## Posting Analytics

Tab: **Posting Analytics** (`?page=posting-analytics`) — timeline, channel health, next slots, advice, resources.  
API: `GET /api/blog/posting-analytics`

## Social

See [SOCIAL.md](./SOCIAL.md).

## Disabling automation quickly

1. `emergency_off = true`
2. `full_auto_enabled = false` and/or `auto_publish_enabled = false`
3. Optionally `BLOG_ENABLED=false` for staff APIs
4. Cancel queued jobs in `blog_generation_jobs`

Details: [OPERATIONS.md](./OPERATIONS.md) and [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).
