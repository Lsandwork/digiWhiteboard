# Automation

Automation is deliberately conservative. Generation and publishing are gated; auto-publish is **off** by default.

## Job queue

Table: `blog_generation_jobs`

| Column | Notes |
|--------|-------|
| `job_type` | Worker-specific type string |
| `payload` | JSON input |
| `status` | `queued` → `running` → `succeeded` / `failed` / `cancelled` |
| `attempts` / `max_attempts` | Default max 3 |
| `run_after` | Delay / schedule |
| `locked_at` | Worker lock |
| `last_error` / `result` | Diagnostics |

Index: `(status, run_after)` for dequeue.

## Cron endpoint

```text
/api/cron/blog-jobs
```

Auth (same pattern as other RuffOps crons):

1. `Authorization: Bearer ${CRON_SECRET}` if `CRON_SECRET` is set, or
2. Vercel cron header `x-vercel-cron: 1`

Unauthorized → 401.

Configure schedule in `vercel.json` (or host cron) once the route is deployed. Suggested starting cadence: every 5–10 minutes, similar to other job workers.

## What automation may do

When enabled by settings + permissions:

- Process queued generation / review / publish jobs
- Advance articles that already passed score gates
- Retry failed jobs up to `max_attempts`
- Respect `run_after` for scheduled work

## What automation must not do (defaults)

| Guard | Default |
|-------|---------|
| Auto-publish | **OFF** (`auto_publish_enabled = false`) |
| AI images | **OFF** |
| First 25 articles | Require human **APPROVED** (or SCHEDULED) before publish |
| Emergency off | Blocks generate + publish |
| Topic score &lt; 85 | No generation |
| Human score &lt; 90 | Stays in `NEEDS_CHANGES` / blocked at publish |

## Manual approval warm-up

`manual_approval_first_n` default **25**. While `published_count < 25`, publish requires `APPROVED` or `SCHEDULED`. This exists so early content is human-vetted before any looser automation.

## Automation rules UI

Admin nav page: **Automation Rules** (`blog.manage_automation`). Keep rules narrow:

- Max articles per week (`max_articles_per_week`, default 7)
- Cost caps (daily / weekly / monthly)
- Quiet editorial windows if you add them later
- Never bypass fact-check flags on medical/legal content

## Enabling auto-publish later

Only after ops review:

1. Confirm `published_count >= 25` with clean quality history.
2. Confirm Gemini (or approved writer) stable and costs within caps.
3. Confirm destinations tested.
4. Set `auto_publish_enabled = true` with Super Admin oversight.
5. Watch Failed queue + `blog_audit_logs` daily for the first week.

## Disabling automation quickly

1. `emergency_off = true` (stops generate/publish).
2. `auto_publish_enabled = false`.
3. Optionally `BLOG_ENABLED=false` for staff APIs.
4. Cancel queued jobs: set `blog_generation_jobs.status = 'cancelled'` where `status in ('queued','running')`.

Details: [OPERATIONS.md](./OPERATIONS.md) and [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).
